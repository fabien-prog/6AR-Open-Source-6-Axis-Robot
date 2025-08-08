#ifndef COMM_MANAGER_H
#define COMM_MANAGER_H

#include <Arduino.h>
#include <ArduinoJson.h>
#include "JointManager.h"
#include "CalibrationManager.h"
#include "ConfigManager.h"
#include "SafetyManager.h"
#include "IOManager.h"
#include "HelperManager.h"
#include "PinDef.h"

static constexpr size_t CMD_BUF_SIZE = 256;
static constexpr size_t RAW_QUEUE_MAX = 400;
static constexpr size_t BATCH_MAX = 500;

struct BatchSegment
{
  // targets are unused in velocity-mode; kept for compatibility
  float targets[CONFIG_JOINT_COUNT];
  float speeds[CONFIG_JOINT_COUNT];
  float accels[CONFIG_JOINT_COUNT];
};

class CommManager
{
public:
  enum class State
  {
    IDLE,
    LOADING,
    EXECUTING
  };

  static CommManager &instance();

  void begin(HardwareSerial &port);
  void poll();
  void processBufferedLines();
  void handleBatchExecution();

  State state() const { return _state; }
  void sendInputStatus();
  void sendHomingResponse(size_t joint, float minPos, float maxPos);
  void sendJointStatus(size_t joint);
  void sendSystemStatus();
  void sendError(const char *errMsg);
  void sendLog(const char *msg);
  void sendCallback(const char *cmd, bool ok, const char *errorMsg = nullptr);

  int getPendingCmdId() const { return _pendingCmdId; }

private:
  CommManager() = default;

  char _rawQueue[RAW_QUEUE_MAX][CMD_BUF_SIZE];
  size_t _rqHead = 0, _rqTail = 0, _rqCount = 0;

  BatchSegment _batch[BATCH_MAX];
  size_t _expected = 0, _loaded = 0;

  static StaticJsonDocument<2048> _json;

  HardwareSerial *_serial = nullptr;
  char _rxBuf[CMD_BUF_SIZE];
  size_t _rxIdx = 0;

  State _state = State::IDLE;
  int _pendingCmdId = -1;

  void enqueueRaw(const char *line);
  bool dequeueRaw(char *out);

  void dispatchLine(const char *line);

  void handleBeginBatch(JsonObject &doc);
  void handleBatchSegmentBatch(JsonObject &doc);
  void handleAbortBatch(JsonObject &);

  void dispatchCommand(JsonObject doc);

  void handleGetInputs(JsonObject &doc);
  void handleGetOutputs(JsonObject &doc);
  void handleGetSystemStatus(JsonObject &doc);
  void handleGetJointStatus(JsonObject &doc);
  void handleMove(JsonObject &doc);
  void handleMoveTo(JsonObject &doc);
  void handleMoveBy(JsonObject &doc);
  void handleMoveMultiple(JsonObject &doc);
  void handleJog(JsonObject &doc);
  void handleStop(JsonObject &doc);
  void handleStopAll(JsonObject &doc);
  void handleHome(JsonObject &doc);
  void handleAbortHoming(JsonObject &doc);
  void handleIsHoming(JsonObject &doc);
  void handleSetParam(JsonObject &doc);
  void handleGetParam(JsonObject &doc);
  void handleSetSoftLimits(JsonObject &doc);
  void handleGetSoftLimits(JsonObject &doc);
  void handleSetMaxSpeed(JsonObject &doc);
  void handleGetMaxSpeed(JsonObject &doc);
  void handleSetMaxAccel(JsonObject &doc);
  void handleGetMaxAccel(JsonObject &doc);
  void handleSetHomeOffset(JsonObject &doc);
  void handleGetHomeOffset(JsonObject &doc);
  void handleSetPositionFactor(JsonObject &doc);
  void handleGetPositionFactor(JsonObject &doc);
  void handleOutput(JsonObject &doc);
  void handleRestart(JsonObject &doc);
  void handleListParameters(JsonObject &doc);

  static constexpr size_t VP_RX_BUF_SIZE = 512U;
  static char rxBuffer[VP_RX_BUF_SIZE];
  size_t rxIndex = 0;
  bool msgReady = false;

  // batch timing
  uint32_t _dtUs = 0;
  uint32_t _lastExecUs = 0;
};

// Exposed to other .cpp
extern uint8_t _substep;
extern size_t _segIndex;
extern float _dtSec;
extern float _prevSpeeds[CONFIG_JOINT_COUNT];
extern float _accelPerSub[CONFIG_JOINT_COUNT];

#endif // COMM_MANAGER_H
