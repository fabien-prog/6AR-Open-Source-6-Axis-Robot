// CommManager.h
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
#include "Config.h"

class CommManager
{
public:
  static CommManager &instance();

  /// Must be called once in setup()
  void begin(HardwareSerial &port);

  /// Call each loop() to read incoming bytes
  void poll();
  /// Call each loop() after poll() to dispatch any completed message
  void processIncoming();
  void processQueue();

  /// Low-level sends
  void sendInputStatus();
  void sendHomingResponse(size_t joint, float minPos, float maxPos);
  void sendJointStatus(size_t joint);
  void sendSystemStatus();
  void sendError(const char *errMsg);
  void sendLog(const char *msg);
  void sendCallback(const char *cmd, bool ok, const char *errorMsg = nullptr);

private:
  CommManager() = default;
  /// Very thin dispatcher: looks at doc["cmd"] and calls one of these
  void dispatchCommand(JsonObject doc);

  // — handlers for all supported cmd strings —
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

  static constexpr size_t RX_BUF_SIZE = 256;
  static constexpr size_t COMMAND_QUEUE_MAX = 1500;
  char cmdQueue[COMMAND_QUEUE_MAX][RX_BUF_SIZE];
  size_t queueHead = 0;
  size_t queueTail = 0;
  size_t queueCount = 0;

  HardwareSerial *serial = nullptr;
  char rxBuffer[RX_BUF_SIZE];
  size_t rxIndex = 0;
  bool msgReady = false;

  bool enqueueCommand(const char *s);
  bool dequeueCommand(char *outBuf);
};

#endif // COMM_MANAGER_H
