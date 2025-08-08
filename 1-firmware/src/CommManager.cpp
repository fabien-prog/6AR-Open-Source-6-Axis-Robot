#include "CommManager.h"
#include "JointManager.h"
#include "CalibrationManager.h"
#include "SafetyManager.h"
#include "IOManager.h"
#include <ArduinoJson.h>

StaticJsonDocument<2048> CommManager::_json;

static constexpr uint32_t FNV_OFFSET = 2166136261u;
static constexpr uint32_t FNV_PRIME = 16777619u;

static constexpr uint8_t SUBDIVISIONS = 50;

size_t _segIndex = 0;
uint8_t _substep = 0;
float _dtSec = 0.0f;
float _prevSpeeds[CONFIG_JOINT_COUNT];
float _accelPerSub[CONFIG_JOINT_COUNT];

static constexpr uint32_t fnv1a(const char *s)
{
  uint32_t h = FNV_OFFSET;
  while (*s)
  {
    h ^= uint8_t(*s++);
    h *= FNV_PRIME;
  }
  return h;
}

CommManager &CommManager::instance()
{
  static CommManager inst;
  return inst;
}

void CommManager::begin(HardwareSerial &port)
{
  _serial = &port;
  rxIndex = 0;
  msgReady = false;
  Serial.begin(921600);
  _serial->begin(921600);
  Serial.println("[CommManager] up @921600");
}

void CommManager::poll()
{
  if (!_serial)
    return;
  while (_serial->available())
  {
    char c = _serial->read();
    if (c == '\r')
      continue;
    if (c == '\n')
    {
      _rxBuf[_rxIdx] = '\0';
      enqueueRaw(_rxBuf);
      _rxIdx = 0;
    }
    else if (_rxIdx + 1 < CMD_BUF_SIZE)
    {
      _rxBuf[_rxIdx++] = c;
    }
    else
    {
      _rxIdx = 0;
      sendCallback("sync", true, nullptr);
    }
  }
}

void CommManager::enqueueRaw(const char *line)
{
  if (_rqCount < RAW_QUEUE_MAX)
  {
    strcpy(_rawQueue[_rqTail], line);
    _rqTail = (_rqTail + 1) % RAW_QUEUE_MAX;
    _rqCount++;
  }
}

bool CommManager::dequeueRaw(char *out)
{
  if (_rqCount == 0)
    return false;
  strcpy(out, _rawQueue[_rqHead]);
  _rqHead = (_rqHead + 1) % RAW_QUEUE_MAX;
  _rqCount--;
  return true;
}

void CommManager::processBufferedLines()
{
  if (_state == State::EXECUTING)
    return;
  char line[CMD_BUF_SIZE];
  while (dequeueRaw(line))
  {
    dispatchLine(line);
    if (_state == State::EXECUTING)
      break;
  }
}

void CommManager::dispatchLine(const char *line)
{
  _json.clear();
  auto err = deserializeJson(_json, line);
  if (err)
  {
    sendCallback("error", false, "parseFailed");
    sendCallback("sync", true, nullptr);
    _rqHead = _rqTail;
    _rqCount = 0;
    _state = State::IDLE;
    return;
  }
  JsonObject doc = _json.as<JsonObject>();
  const char *cmd = doc["cmd"];
  _pendingCmdId = doc.containsKey("id") ? doc["id"].as<int>() : -1;

  if (_state == State::IDLE)
  {
    if (strcmp(cmd, "BeginBatch") == 0)
      handleBeginBatch(doc);
    else
      dispatchCommand(doc);
  }
  else if (_state == State::LOADING)
  {
    if (strcmp(cmd, "M") == 0)
      handleBatchSegmentBatch(doc);
    else if (strcmp(cmd, "AbortBatch") == 0)
      handleAbortBatch(doc);
    else
      sendCallback("error", false, "notLoadingBatch");
  }
  _pendingCmdId = -1;
}

void CommManager::handleBeginBatch(JsonObject &doc)
{
  _expected = doc["count"].as<size_t>();
  float dt = doc["dt"].as<float>();
  if (_expected == 0 || _expected > BATCH_MAX || dt <= 0)
  {
    sendCallback("BeginBatch", false, "invalidCountOrDt");
    return;
  }
  _dtSec = dt;
  _dtUs = uint32_t(dt * 1e6f);

  _loaded = 0;
  _segIndex = 0;
  _substep = 0;
  for (size_t j = 0; j < CONFIG_JOINT_COUNT; ++j)
  {
    _prevSpeeds[j] = 0.0f;
    _accelPerSub[j] = 0.0f;
  }

  // put all joints into jog mode at 0 speed (so slices update cleanly)
  JointManager::instance().setAllJogZero(500.0f);

  _state = State::LOADING;
  sendCallback("BeginBatch", true);
}

// ——— handleBatchSegmentBatch() ———————————————————————
void CommManager::handleBatchSegmentBatch(JsonObject &doc)
{
  if (_loaded >= _expected)
  {
    sendCallback("SegmentError", false, "tooMany");
    return;
  }
  auto arrS = doc["s"].as<JsonArray>();
  auto arrA = doc["a"].as<JsonArray>();
  if (arrS.size() != CONFIG_JOINT_COUNT || arrA.size() != CONFIG_JOINT_COUNT)
  {
    sendCallback("SegmentError", false, "badLength");
    return;
  }
  for (size_t j = 0; j < CONFIG_JOINT_COUNT; ++j)
  {
    _batch[_loaded].speeds[j] = arrS[j].as<float>();
    _batch[_loaded].accels[j] = arrA[j].as<float>();
  }
  _loaded++;
  sendCallback("SegmentLoaded", true);

  if (_loaded == _expected)
  {
    _state = State::EXECUTING;
    _lastExecUs = micros();
    sendCallback("BatchExecStart", true);
  }
}

void CommManager::handleAbortBatch(JsonObject &)
{
  _state = State::IDLE;
  _loaded = _expected = 0;
  JointManager::instance().setAllJogZero(60.0f);
  sendCallback("BatchAborted", true);
}

// ——— handleBatchExecution(): only feed next when motors idle —————
void CommManager::handleBatchExecution()
{
  if (_state != State::EXECUTING)
    return;

  uint32_t now = micros();
  if (now - _lastExecUs < _dtUs / SUBDIVISIONS)
    return;
  _lastExecUs = now;

  if (_segIndex >= _loaded)
  {
    // final safety: ensure we bleed to zero (Python should also end with zero speeds)
    JointManager::instance().setAllJogZero(60.0f);
    _state = State::IDLE;
    sendCallback("BatchComplete", true);
    return;
  }

  if (_substep == 0)
  {
    auto &seg = _batch[_segIndex];
    for (size_t j = 0; j < CONFIG_JOINT_COUNT; ++j)
    {
      _accelPerSub[j] = seg.accels[j] * _dtSec / float(SUBDIVISIONS);
    }
  }

  float speeds[CONFIG_JOINT_COUNT];
  float accels[CONFIG_JOINT_COUNT];
  for (size_t j = 0; j < CONFIG_JOINT_COUNT; ++j)
  {
    float newSpd = _prevSpeeds[j] + _accelPerSub[j] * float(_substep + 1);
    speeds[j] = newSpd;                                                  // signed deg/s
    accels[j] = fabsf(_accelPerSub[j]) / (_dtSec / float(SUBDIVISIONS)); // deg/s² equivalent inside sub-step
    // Note: we only need a magnitude for accel; direction is in speed sign
  }

  // Apply the mini-step to steppers (velocity mode)
  JointManager::instance().feedVelocitySlice(speeds, accels);

  if (++_substep >= SUBDIVISIONS)
  {
    for (size_t j = 0; j < CONFIG_JOINT_COUNT; ++j)
      _prevSpeeds[j] = _batch[_segIndex].speeds[j];
    _substep = 0;
    _segIndex++;
  }
}

// ——— sendCallback() ————————————————————————————————————————
void CommManager::sendCallback(const char *cmd, bool ok, const char *err)
{
  StaticJsonDocument<64> d;
  d["cmd"] = cmd;
  d["status"] = ok ? "ok" : "error";
  if (_pendingCmdId >= 0)
    d["id"] = _pendingCmdId;
  if (!ok && err)
    d["error"] = err;
  String out;
  serializeJson(d, out);
  if (_serial)
    _serial->println(out);
}

// ——— dispatchCommand(): legacy hash↦handler ————————————————————
void CommManager::dispatchCommand(JsonObject doc)
{
  const char *cmd = doc["cmd"].as<const char *>();
  _pendingCmdId = doc.containsKey("id") ? doc["id"].as<int>() : -1;
  uint32_t h = fnv1a(cmd);

  switch (h)
  {
  case fnv1a("GetInputs"):
    handleGetInputs(doc);
    break;
  case fnv1a("GetOutputs"):
    handleGetOutputs(doc);
    break;
  case fnv1a("GetSystemStatus"):
    handleGetSystemStatus(doc);
    break;
  case fnv1a("GetJointStatus"):
    handleGetJointStatus(doc);
    break;
  case fnv1a("Move"):
    handleMove(doc);
    break;
  case fnv1a("MoveTo"):
    handleMoveTo(doc);
    break;
  case fnv1a("MoveBy"):
    handleMoveBy(doc);
    break;
  case fnv1a("MoveMultiple"):
    handleMoveMultiple(doc);
    break;
  case fnv1a("Jog"):
    handleJog(doc);
    break;
  case fnv1a("Stop"):
    handleStop(doc);
    break;
  case fnv1a("StopAll"):
    handleStopAll(doc);
    break;
  case fnv1a("Home"):
    handleHome(doc);
    break;
  case fnv1a("AbortHoming"):
    handleAbortHoming(doc);
    break;
  case fnv1a("IsHoming"):
    handleIsHoming(doc);
    break;
  case fnv1a("SetParam"):
    handleSetParam(doc);
    break;
  case fnv1a("GetParam"):
    handleGetParam(doc);
    break;
  case fnv1a("SetSoftLimits"):
    handleSetSoftLimits(doc);
    break;
  case fnv1a("GetSoftLimits"):
    handleGetSoftLimits(doc);
    break;
  case fnv1a("SetMaxSpeed"):
    handleSetMaxSpeed(doc);
    break;
  case fnv1a("GetMaxSpeed"):
    handleGetMaxSpeed(doc);
    break;
  case fnv1a("SetMaxAccel"):
    handleSetMaxAccel(doc);
    break;
  case fnv1a("GetMaxAccel"):
    handleGetMaxAccel(doc);
    break;
  case fnv1a("SetHomeOffset"):
    handleSetHomeOffset(doc);
    break;
  case fnv1a("GetHomeOffset"):
    handleGetHomeOffset(doc);
    break;
  case fnv1a("SetPositionFactor"):
    handleSetPositionFactor(doc);
    break;
  case fnv1a("GetPositionFactor"):
    handleGetPositionFactor(doc);
    break;
  case fnv1a("Output"):
    handleOutput(doc);
    break;
  case fnv1a("Restart"):
    handleRestart(doc);
    break;
  case fnv1a("ListParameters"):
    handleListParameters(doc);
    break;
  default:
    sendCallback("unknownCmd", false, cmd);
    break;
  }

  _pendingCmdId = -1;
}

static inline void attachId(JsonDocument &d)
{
  int id = CommManager::instance().getPendingCmdId();
  if (id >= 0)
    d["id"] = id;
}

// ——— Handlers ———————————————————————————————————

void CommManager::handleGetInputs(JsonObject &)
{
  StaticJsonDocument<256> doc;
  doc["cmd"] = "inputStatus";
  auto data = doc.createNestedObject("data");
  data["estop"] = SafetyManager::instance().isEStopped() ? 1 : 0;
  auto btns = data.createNestedArray("buttons");
  for (size_t i = 0; i < BUTTON_COUNT; ++i)
    btns.add(IOManager::instance().isDigitalActive(i) ? 1 : 0);
  auto lims = data.createNestedArray("limits");
  for (size_t i = 0; i < LIMIT_COUNT; ++i)
    lims.add(IOManager::instance().isLimitActive(i) ? 1 : 0);
  attachId(doc);
  String out;
  serializeJson(doc, out);
  _serial->println(out);
}

void CommManager::handleGetOutputs(JsonObject &)
{
  StaticJsonDocument<256> doc;
  doc["cmd"] = "outputStatus";
  auto data = doc.createNestedObject("data");
  auto arr = data.createNestedArray("states");
  for (size_t i = 0; i < RELAY_COUNT; ++i)
    arr.add(IOManager::instance().getOutput(i) ? 1 : 0);

  attachId(doc); // <-- add this line
  String out;
  serializeJson(doc, out);
  _serial->println(out);
}

void CommManager::handleGetSystemStatus(JsonObject &)
{
  StaticJsonDocument<256> doc;
  doc["cmd"] = "systemStatus";
  auto data = doc.createNestedObject("data");
  data["uptime"] = millis();
  data["estop"] = SafetyManager::instance().isEStopped() ? 1 : 0;
  data["homing"] = CalibrationManager::instance().isHoming() ? 1 : 0;
  attachId(doc);
  String out;
  serializeJson(doc, out);
  _serial->println(out);
}

void CommManager::handleGetJointStatus(JsonObject &doc)
{
  {
    // If no "joint" field, send *all* joints in one array
    if (!doc.containsKey("joint"))
    {
      StaticJsonDocument<512> pd;
      pd["cmd"] = "jointStatusAll";
      auto arr = pd.createNestedArray("data");
      for (size_t j = 0; j < CONFIG_JOINT_COUNT; ++j)
      {
        JsonObject o = arr.createNestedObject();
        o["joint"] = int(j + 1);
        o["position"] = JointManager::instance().getPosition(j);
        o["velocity"] = JointManager::instance().getSpeed(j);
        o["acceleration"] = JointManager::instance().getAccel(j);
        o["target"] = JointManager::instance().getTarget(j);
      }

      attachId(pd);
      String out;
      serializeJson(pd, out);
      _serial->println(out);
      return;
    }
    // otherwise fall back to the single-joint response
    int j = doc["joint"].as<int>() - 1;
    if (j < 0 || j >= CONFIG_JOINT_COUNT)
    {
      sendCallback("jointStatus", false, "invalid joint");
      return;
    }
    // **NEW**: send the single-joint response
    StaticJsonDocument<256> pd;
    pd["cmd"] = "jointStatus";
    auto data = pd.createNestedObject("data");
    data["joint"] = j + 1;
    data["position"] = JointManager::instance().getPosition(j);
    data["velocity"] = JointManager::instance().getSpeed(j);
    data["acceleration"] = JointManager::instance().getAccel(j);
    data["target"] = JointManager::instance().getTarget(j);
    attachId(pd);
    String out;
    serializeJson(pd, out);
    _serial->println(out);
  }
}

void CommManager::handleMove(JsonObject &doc) { handleMoveTo(doc); }

void CommManager::handleMoveTo(JsonObject &doc)
{
  int j = doc["joint"].as<int>() - 1;
  if (j < 0 || j >= CONFIG_JOINT_COUNT)
  {
    sendCallback("moveTo", false, "invalid joint");
    return;
  }
  float tgt = doc["target"].as<float>();
  float spd = doc["speed"].as<float>();
  float acc = doc["accel"].as<float>();
  bool ok = JointManager::instance().move(j, tgt, spd, acc);
  sendCallback("moveTo", ok, ok ? nullptr : "invalid/moving/estop");
}

void CommManager::handleMoveBy(JsonObject &doc)
{
  int j = doc["joint"].as<int>() - 1;
  float d = doc["delta"].as<float>();
  float spd = doc["speed"].as<float>();
  float acc = doc["accel"].as<float>();

  // compute absolute target = current + delta
  float cur = JointManager::instance().getPosition(j);
  bool ok = JointManager::instance().move(j, cur + d, spd, acc);
  sendCallback("moveBy", ok, ok ? nullptr : "invalid/moving/estop");
  return;
}

void CommManager::handleMoveMultiple(JsonObject &doc)
{
  auto js = doc["joints"].as<JsonArray>();
  auto tgts = doc["targets"].as<JsonArray>();
  auto spds = doc["speeds"].as<JsonArray>();
  auto acs = doc["accels"].as<JsonArray>();

  size_t N = js.size();
  if (N == 0 || tgts.size() != N || spds.size() != N || acs.size() != N)
  {
    sendCallback("moveMultiple", false, "length mismatch");
    return;
  }

  // Build temporary arrays on the stack
  size_t joints[N];
  float targets[N];
  float speeds[N];
  float accels[N];

  // Parse & validate
  for (size_t i = 0; i < N; ++i)
  {
    int ji = js[i].as<int>() - 1;
    if (ji < 0 || ji >= CONFIG_JOINT_COUNT)
    {
      sendCallback("moveMultiple", false, "invalid joint");
      return;
    }
    joints[i] = size_t(ji);
    targets[i] = tgts[i].as<float>();
    speeds[i] = spds[i].as<float>();
    accels[i] = acs[i].as<float>();
  }

  // Fire off all moves in one shot
  bool ok = JointManager::instance()
                .moveMultiple(joints,
                              targets,
                              speeds,
                              accels,
                              N /* count */,
                              false /* ignoreLimits? */);

  sendCallback("moveMultiple",
               ok,
               ok ? nullptr : "invalid/moving/estop");
}

void CommManager::handleJog(JsonObject &doc)
{
  int j = doc["joint"].as<int>() - 1;
  float targetV = doc["target"].as<float>();
  float accel = doc["accel"].as<float>();
  bool ok = JointManager::instance().jog(j, targetV, accel);
  sendCallback("jog", ok, ok ? nullptr : "invalid/moving/estop");
}
void CommManager::handleStop(JsonObject &doc)
{
  int j = doc["joint"].as<int>() - 1;
  JointManager::instance().stopAll();
  sendCallback("stop", true);
}
void CommManager::handleStopAll(JsonObject &)
{
  JointManager::instance().stopAll();
  sendCallback("stopAll", true);
}
void CommManager::handleHome(JsonObject &doc)
{
  int j = doc["joint"].as<int>() - 1;
  float fastSp = doc["speedFast"].as<float>();
  float slowSp = doc["speedSlow"].as<float>();
  CalibrationManager::instance().homeJoint(j, fastSp, slowSp);
  sendCallback("home", true);
}
void CommManager::handleAbortHoming(JsonObject &)
{
  CalibrationManager::instance().stopAllMotors();
  sendCallback("abortHoming", true);
}
void CommManager::handleIsHoming(JsonObject &)
{
  StaticJsonDocument<64> doc;
  doc["cmd"] = "isHoming";
  doc["data"] = CalibrationManager::instance().isHoming() ? 1 : 0;
  attachId(doc);
  String out;
  serializeJson(doc, out);
  _serial->println(out);
}

void CommManager::handleSetParam(JsonObject &doc)
{
  const char *k = doc["key"];
  float v = doc["value"].as<float>();
  auto &cm = ConfigManager::instance();
  cm.setParameter(k, v);
  cm.saveConfig();
  sendCallback("setParam", true);
}
void CommManager::handleGetParam(JsonObject &doc)
{
  const char *k = doc["key"];
  float def = doc["default"].as<float>();
  float v = ConfigManager::instance().getParameter(k, def);

  StaticJsonDocument<128> pd;
  pd["cmd"] = "getParam";
  auto data = pd.createNestedObject("data");
  data["key"] = k;
  data["value"] = v;
  attachId(pd);
  String out;
  serializeJson(pd, out);
  _serial->println(out);
}

void CommManager::handleSetSoftLimits(JsonObject &doc)
{
  int j = doc["joint"].as<int>() - 1;
  float mn = doc["min"].as<float>();
  float mx = doc["max"].as<float>();
  JointManager::instance().setSoftLimits(j, mn, mx);
  sendCallback("setSoftLimits", true);
}
void CommManager::handleGetSoftLimits(JsonObject &doc)
{
  int j;
  float mn, mx;
  j = doc["joint"].as<int>() - 1;
  JointManager::instance().getSoftLimits(j, mn, mx);

  StaticJsonDocument<128> pd;
  pd["cmd"] = "getSoftLimits";
  auto data = pd.createNestedObject("data");
  data["joint"] = j + 1;
  data["min"] = mn;
  data["max"] = mx;
  attachId(pd);
  String out;
  serializeJson(pd, out);
  _serial->println(out);
}

void CommManager::handleSetMaxSpeed(JsonObject &doc)
{
  int j = doc["joint"].as<int>() - 1;
  JointManager::instance().setMaxSpeed(j, doc["value"].as<float>());
  sendCallback("setMaxSpeed", true);
}
void CommManager::handleGetMaxSpeed(JsonObject &doc)
{
  int j = doc["joint"].as<int>() - 1;
  float v = JointManager::instance().getMaxSpeed(j);

  StaticJsonDocument<64> pd;
  pd["cmd"] = "getMaxSpeed";
  pd["data"] = v;
  attachId(pd);
  String out;
  serializeJson(pd, out);
  _serial->println(out);
}

void CommManager::handleSetMaxAccel(JsonObject &doc)
{
  int j = doc["joint"].as<int>() - 1;
  JointManager::instance().setMaxAccel(j, doc["value"].as<float>());
  sendCallback("setMaxAccel", true);
}
void CommManager::handleGetMaxAccel(JsonObject &doc)
{
  int j = doc["joint"].as<int>() - 1;
  float v = JointManager::instance().getMaxAccel(j);

  StaticJsonDocument<64> pd;
  pd["cmd"] = "getMaxAccel";
  pd["data"] = v;
  attachId(pd);
  String out;
  serializeJson(pd, out);
  _serial->println(out);
}

void CommManager::handleSetHomeOffset(JsonObject &doc)
{
  int j = doc["joint"].as<int>() - 1;
  float off = doc["value"].as<float>();
  String key = String("joint") + String(j + 1) + ".homeOffset";
  ConfigManager::instance().setParameter(key.c_str(), off);
  sendCallback("setHomeOffset", true);
}

void CommManager::handleListParameters(JsonObject &)
{
  StaticJsonDocument<2048> doc;

  doc["cmd"] = "parameters";
  auto data = doc.createNestedObject("data");
  auto p = data.createNestedObject("params");
  for (JsonPairConst kv : ConfigManager::instance().getFullConfig().as<JsonObjectConst>())
  {
    p[kv.key()] = kv.value();
  }

  // immediately check if we blew past capacity
  if (doc.overflowed())
  {
    // reply with an error instead of sending a truncated JSON
    StaticJsonDocument<128> err;
    err["cmd"] = "parameters";
    err["status"] = "error";
    err["error"] = "EEPROM overflow";
    attachId(err);
    String outErr;
    serializeJson(err, outErr);
    _serial->println(outErr);
    return;
  }

  attachId(doc);
  String out;
  serializeJson(doc, out);
  _serial->println(out);
}

void CommManager::handleGetHomeOffset(JsonObject &doc)
{
  int j = doc["joint"].as<int>() - 1;
  float off = ConfigManager::instance().getParameter(
      (String("joint") + String(j + 1) + ".homeOffset").c_str(),
      JOINT_CONFIG[j].homeOffset);
  StaticJsonDocument<64> pd;
  pd["cmd"] = "getHomeOffset";
  pd["data"] = off;
  attachId(pd);
  String out;
  serializeJson(pd, out);
  _serial->println(out);
}

void CommManager::handleSetPositionFactor(JsonObject &doc)
{
  int j = doc["joint"].as<int>() - 1;
  float f = doc["value"].as<float>();
  String key = String("joint") + String(j + 1) + ".positionFactor";
  ConfigManager::instance().setParameter(key.c_str(), f);
  sendCallback("setPositionFactor", true);
}
void CommManager::handleGetPositionFactor(JsonObject &doc)
{
  int j = doc["joint"].as<int>() - 1;
  float f = ConfigManager::instance().getParameter(
      (String("joint") + String(j + 1) + ".positionFactor").c_str(),
      JOINT_CONFIG[j].positionFactor);
  StaticJsonDocument<64> pd;
  pd["cmd"] = "getPositionFactor";
  pd["data"] = f;
  attachId(pd);
  String out;
  serializeJson(pd, out);
  _serial->println(out);
}

void CommManager::handleOutput(JsonObject &doc)
{
  JsonArray outs = doc["outputs"].as<JsonArray>();
  JsonArray states = doc["states"].as<JsonArray>();
  if (outs.size() != states.size())
  {
    sendCallback("output", false, "length mismatch");
    return;
  }

  // Delegate to IOManager so its internal state stays in sync:
  for (size_t i = 0; i < outs.size(); ++i)
  {
    int idxZero = outs[i].as<int>() - 1;
    bool on = (states[i].as<int>() != 0);
    IOManager::instance().setOutput(idxZero, on);
  }

  sendCallback("output", true);
}

// ——— Convenience —————————————————————————————————

void CommManager::sendError(const char *errMsg)
{
  sendCallback("error", false, errMsg);
}

void CommManager::sendLog(const char *msg)
{
  StaticJsonDocument<128> doc;
  doc["cmd"] = "log";
  doc["data"] = msg;
  String out;
  serializeJson(doc, out);
  if (_serial)
    _serial->println(out);
}

void CommManager::sendInputStatus()
{
  StaticJsonDocument<256> doc;
  doc["cmd"] = "inputStatus";
  JsonObject data = doc.createNestedObject("data");
  data["estop"] = SafetyManager::instance().isEStopped() ? 1 : 0;
  // buttons
  JsonArray btns = data.createNestedArray("buttons");
  for (size_t i = 0; i < BUTTON_COUNT; ++i)
  {
    btns.add(IOManager::instance().isDigitalActive(i) ? 1 : 0);
  }
  // limits
  JsonArray lims = data.createNestedArray("limits");
  for (size_t i = 0; i < LIMIT_COUNT; ++i)
  {
    lims.add(IOManager::instance().isLimitActive(i) ? 1 : 0);
  }
  attachId(doc);
  String out;
  serializeJson(doc, out);
  _serial->println(out);
}

void CommManager::sendHomingResponse(size_t joint, float minPos, float maxPos)
{
  StaticJsonDocument<128> doc;
  doc["cmd"] = "homed";
  JsonObject data = doc.createNestedObject("data");
  data["joint"] = int(joint + 1);
  data["min"] = minPos;
  data["max"] = maxPos;
  attachId(doc);
  String out;
  serializeJson(doc, out);
  _serial->println(out);
}

void CommManager::sendJointStatus(size_t joint)
{
  if (joint >= CONFIG_JOINT_COUNT)
  {
    sendCallback("jointStatus", false, "invalid joint");
    return;
  }
  StaticJsonDocument<256> doc;
  doc["cmd"] = "jointStatus";
  JsonObject data = doc.createNestedObject("data");
  data["joint"] = int(joint + 1);
  data["position"] = JointManager::instance().getPosition(joint);
  data["velocity"] = JointManager::instance().getSpeed(joint);
  data["acceleration"] = JointManager::instance().getAccel(joint);
  data["target"] = JointManager::instance().getTarget(joint);
  attachId(doc);
  String out;
  serializeJson(doc, out);
  _serial->println(out);
}

void CommManager::sendSystemStatus()
{
  StaticJsonDocument<256> doc;
  doc["cmd"] = "systemStatus";
  JsonObject data = doc.createNestedObject("data");
  data["uptimeSec"] = millis() / 1000; // seconds since boot
  data["estop"] = SafetyManager::instance().isEStopped() ? 1 : 0;
  data["homing"] = CalibrationManager::instance().isHoming() ? 1 : 0;
  attachId(doc);
  String out;
  serializeJson(doc, out);
  _serial->println(out);
}

void CommManager::handleRestart(JsonObject &)
{
  // 1) immediately kill any motion
  CalibrationManager::instance().stopAllMotors();
  JointManager::instance().stopAll();

  // 2) ack back to the host
  sendCallback("Restart", true);

  // 3) persist positions & reset
  HelperManager::instance().restart();

  // (never returns)
}