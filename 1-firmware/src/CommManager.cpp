// CommManager.cpp
#include "CommManager.h"

static int _pendingCmdId = -1;

CommManager &CommManager::instance()
{
  static CommManager inst;
  return inst;
}

static inline void attachId(JsonDocument &d)
{
  if (_pendingCmdId >= 0)
    d["id"] = _pendingCmdId;
}

void CommManager::begin(HardwareSerial &port)
{
  serial = &port;
  rxIndex = 0;
  msgReady = false;
  Serial.begin(115200);
  serial->begin(115200);
  Serial.println("[CommManager] up @115200");
}

void CommManager::poll()
{
  if (!serial)
    return;

  while (serial->available())
  {
    char c = serial->read();
    if (c == '\r')
    {
      // drop carriage‐return quietly
      continue;
    }
    if (c == '\n')
    {
      // end of one JSON line
      rxBuffer[rxIndex] = '\0';
      msgReady = true;
      // immediately reset, so the next poll starts fresh
      rxIndex = 0;
      break;
    }
    // only build up to RX_BUF_SIZE−1 chars
    if (rxIndex < RX_BUF_SIZE - 1)
    {
      rxBuffer[rxIndex++] = c;
    }
  }
}

bool CommManager::enqueueCommand(const char *s)
{
  if (queueCount >= COMMAND_QUEUE_MAX)
    return false;
  strncpy(cmdQueue[queueTail], s, RX_BUF_SIZE);
  cmdQueue[queueTail][RX_BUF_SIZE - 1] = '\0';
  queueTail = (queueTail + 1) % COMMAND_QUEUE_MAX;
  ++queueCount;
  return true;
}

// — pop the next queued line into outBuf, return false if empty
bool CommManager::dequeueCommand(char *outBuf)
{
  if (queueCount == 0)
    return false;
  strcpy(outBuf, cmdQueue[queueHead]);
  queueHead = (queueHead + 1) % COMMAND_QUEUE_MAX;
  --queueCount;
  return true;
}

void CommManager::processQueue()
{
  if (queueCount > 0)
  {
    StaticJsonDocument<64> peek;
    if (!deserializeJson(peek, cmdQueue[queueHead]))
    {
      const char *cmd = peek["cmd"];
      if (cmd && strcmp(cmd, "Restart") == 0)
      {
        // dequeue it…
        char line[RX_BUF_SIZE];
        dequeueCommand(line);
        // …and dispatch it right now
        StaticJsonDocument<256> root;
        deserializeJson(root, line);
        dispatchCommand(root.as<JsonObject>());
        return; // don't process anything else
      }
    }
  }
  // 1) never dispatch anything while we’re homing
  if (CalibrationManager::instance().isHoming())
    return;

  // 2) peek at the next queued line (without dequeuing yet)
  bool nextIsMM = false;
  if (queueCount > 0)
  {
    StaticJsonDocument<128> tmp;
    if (!deserializeJson(tmp, cmdQueue[queueHead]))
    {
      const char *next = tmp["cmd"];
      nextIsMM = (next && strcmp(next, "MoveMultiple") == 0);
    }
  }

  // 3) only dequeue when:
  //    - if it’s NOT a MoveMultiple, wait until no axis is moving
  //    - if it IS a MoveMultiple, wait until we’re within LOOKAHEAD_STEPS of completion
  const long LOOKAHEAD_STEPS = 75;
  if (nextIsMM)
  {
    if (!JointManager::instance().allJointsNearTarget(LOOKAHEAD_STEPS))
      return;
  }
  else
  {
    if (JointManager::instance().isAnyMoving())
      return;
  }

  // 4) now safe to dequeue & dispatch
  char line[RX_BUF_SIZE];
  if (!dequeueCommand(line))
    return;
  StaticJsonDocument<512> json;
  auto err = deserializeJson(json, line);
  if (err)
  {
    sendError(err.c_str());
  }
  else
  {
    dispatchCommand(json.as<JsonObject>());
  }
}

void CommManager::processIncoming()
{
  if (!msgReady)
    return;

  // 1) parse the incoming JSON
  StaticJsonDocument<256> doc;
  DeserializationError err = deserializeJson(doc, rxBuffer);
  msgReady = false;
  rxIndex = 0;

  if (err)
  {
    sendError(err.c_str());
    return;
  }

  const char *cmd = doc["cmd"];
  if (!cmd)
  {
    sendCallback("missingCmd", false, "no cmd field");
    return;
  }

  // 2) Immediate dispatch for “status” commands:
  if (strcmp(cmd, "GetJointStatus") == 0 ||
      strcmp(cmd, "GetSystemStatus") == 0 ||
      strcmp(cmd, "GetInputs") == 0 ||
      strcmp(cmd, "GetOutputs") == 0 ||
      strcmp(cmd, "ListParameters") == 0 ||
      strcmp(cmd, "IsHoming") == 0 ||
      strcmp(cmd, "Restart") == 0 ||
      strcmp(cmd, "Stop") == 0 ||
      strcmp(cmd, "StopAll") == 0)
  {
    // inside processIncoming() *right before* dispatchCommand(...)
    _pendingCmdId = doc.containsKey("id") ? int(doc["id"]) : -1;
    dispatchCommand(doc.as<JsonObject>());
    _pendingCmdId = -1; // nobody waiting now
    return;
  }

  // 3) Everything else still goes into the queue
  if (!enqueueCommand(rxBuffer))
    sendError("Command queue full");
}

void CommManager::dispatchCommand(JsonObject doc)
{
  // remember id (if any) for *every* command
  _pendingCmdId = doc.containsKey("id") ? int(doc["id"]) : -1;

  const char *cmd = doc["cmd"];
  if (!cmd)
  {
    sendCallback("missingCmd", false, "no cmd field");
    _pendingCmdId = -1;
    return;
  }

#define CMD(name) else if (strcmp(cmd, #name) == 0) handle##name(doc)
  if (0)
  {
  }
  CMD(GetInputs);
  CMD(GetOutputs);
  CMD(GetSystemStatus);
  CMD(GetJointStatus);
  CMD(Move);
  CMD(MoveTo);
  CMD(MoveBy);
  CMD(MoveMultiple);
  CMD(Jog);
  CMD(Stop);
  CMD(StopAll);
  CMD(Home);
  CMD(AbortHoming);
  CMD(IsHoming);
  CMD(SetParam);
  CMD(GetParam);
  CMD(SetSoftLimits);
  CMD(GetSoftLimits);
  CMD(SetMaxSpeed);
  CMD(GetMaxSpeed);
  CMD(SetMaxAccel);
  CMD(GetMaxAccel);
  CMD(SetHomeOffset);
  CMD(GetHomeOffset);
  CMD(SetPositionFactor);
  CMD(GetPositionFactor);
  CMD(Output);
  CMD(Restart);
  CMD(ListParameters);
  else
  {
    sendCallback("unknownCmd", false, cmd);
  }
#undef CMD
  _pendingCmdId = -1; // done — stop echoing
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
  serial->println(out);
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
  serial->println(out);
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
  serial->println(out);
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
      serial->println(out);
      return;
    }
    // otherwise fall back to the single-joint response
    int j = doc["joint"].as<int>() - 1;
    if (j < 0 || j >= CONFIG_JOINT_COUNT)
    {
      sendCallback("jointStatus", false, "invalid joint");
      return;
    }
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
  bool ok = JointManager::instance().moveTo(j, tgt, spd, acc);
  sendCallback("moveTo", ok, ok ? nullptr : "invalid/moving/estop");
}

void CommManager::handleMoveBy(JsonObject &doc)
{
  int j = doc["joint"].as<int>() - 1;
  float d = doc["delta"].as<float>();
  float spd = doc["speed"].as<float>();
  float acc = doc["accel"].as<float>();
  bool ok = JointManager::instance().moveBy(j, d, spd, acc);
  sendCallback("moveBy", ok, ok ? nullptr : "invalid");
}

void CommManager::handleMoveMultiple(JsonObject &doc)
{
  auto js = doc["joints"].as<JsonArray>();
  auto tgts = doc["targets"].as<JsonArray>();
  auto spds = doc["speeds"].as<JsonArray>();
  auto acs = doc["accels"].as<JsonArray>();

  if (js.size() != tgts.size() || js.size() != spds.size() || js.size() != acs.size())
  {
    sendCallback("moveMultiple", false, "length mismatch");
    return;
  }

  // blending logic unchanged
  bool blending = false;
  if (queueCount > 0)
  { /* … */
  }

  for (size_t i = 0; i < js.size(); ++i)
  {
    int j = js[i].as<int>() - 1;
    if (j < 0 || j >= CONFIG_JOINT_COUNT)
      continue;

    float tgt = tgts[i].as<float>();
    float spd = spds[i].as<float>();
    float acc = acs[i].as<float>();

    // pass the real accel each segment
    JointManager::instance().runJoint(j, tgt, spd, acc, true);
    sendCallback("moveMultiple", true);
  }
}

void CommManager::handleJog(JsonObject &doc)
{
  int j = doc["joint"].as<int>() - 1;
  float spd = doc["speed"].as<float>();
  bool ok = JointManager::instance().jogJoint(j, spd);
  sendCallback("jog", ok);
}
void CommManager::handleStop(JsonObject &doc)
{
  int j = doc["joint"].as<int>() - 1;
  JointManager::instance().stopJoint(j);
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
  serial->println(out);
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
  serial->println(out);
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
  serial->println(out);
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
  serial->println(out);
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
  serial->println(out);
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
  const JsonDocument &cfg = ConfigManager::instance().getFullConfig();
  JsonObjectConst full = cfg.as<JsonObjectConst>();

  StaticJsonDocument<2048> doc;
  doc["cmd"] = "parameters";
  auto data = doc.createNestedObject("data");
  auto p = data.createNestedObject("params");
  for (JsonPairConst kv : full)
    p[kv.key()] = kv.value();

  attachId(doc); //  ← add this
  String out;
  serializeJson(doc, out);
  serial->println(out);
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
  serial->println(out);
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
  serial->println(out);
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
  if (serial)
    serial->println(out);
}

// ───────── sendCallback stays exactly as in your draft ─────────
void CommManager::sendCallback(const char *cmd, bool ok, const char *err)
{
  StaticJsonDocument<128> doc;
  doc["cmd"] = cmd;
  doc["status"] = ok ? "ok" : "error";
  if (_pendingCmdId >= 0)
    doc["id"] = _pendingCmdId; // <-- echo!
  if (!ok && err)
    doc["error"] = err;
  String out;
  serializeJson(doc, out);
  serial->println(out);
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
  serial->println(out);
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
  serial->println(out);
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
  serial->println(out);
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
  serial->println(out);
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
