#ifndef JOINT_MANAGER_H
#define JOINT_MANAGER_H

#include <Arduino.h>
#include <AccelStepper.h>
#include "Config.h"
#include "ConfigManager.h"
#include "SafetyManager.h"

static constexpr int CONTROL_HZ = 1000; // for logging frequency

class JointManager
{
public:
  static JointManager &instance();
  void begin();
  /// Call this from your main loop to step all motors
  void updateSteppers();

  // ─── motion APIs ────────────────────────────────────────────
  bool moveTo(size_t j, float targetDeg, float speed, float accel);
  bool moveBy(size_t j, float deltaDeg, float speed, float accel);
  bool jogJoint(size_t j, float degPerSec);
  void stopJoint(size_t j);
  void stopAll();
  bool isMoving(size_t j);
  bool isAnyMoving();
  bool allJointsNearTarget(long thresholdSteps);


  // ─── low-level run ──────────────────────────────────────────
  bool runJoint(size_t j,
                float targetDeg,
                float maxDps,
                float accelDps2,
                bool clampTarget = true);

  // ─── queries ────────────────────────────────────────────────
  float getPosition(size_t j); // real°
  float getTarget(size_t j);   // real° (NaN in jog mode)
  float getSpeed(size_t j);    // °/s
  float getAccel(size_t j);    // °/s²

  void resetPosition(size_t j, float deg);

  // ─── soft limits ────────────────────────────────────────────
  void setSoftLimits(size_t j, float minDeg, float maxDeg);
  void getSoftLimits(size_t j, float &minDeg, float &maxDeg) const;

  // ─── tuning ─────────────────────────────────────────────────
  void setMaxSpeed(size_t j, float maxDps);
  float getMaxSpeed(size_t j) const;
  void setMaxAccel(size_t j, float maxDps2);
  float getMaxAccel(size_t j) const;

  // ─── logging ───────────────────────────────────────────────
  void startLogging(size_t j, unsigned long intervalMs = 100);
  void stopLogging();
  void handleLogging();

  AccelStepper steppers[CONFIG_JOINT_COUNT];

private:
  JointManager();
  bool jogMode[CONFIG_JOINT_COUNT] = {false};

  size_t logJoint = SIZE_MAX;
  unsigned long logInterval = 0, lastLogMs = 0;

  float stepsPerDeg(size_t j) const;
};

#endif // JOINT_MANAGER_H
