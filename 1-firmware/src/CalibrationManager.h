#ifndef CALIBRATION_MANAGER_H
#define CALIBRATION_MANAGER_H

#include <Arduino.h>
#include "Config.h"
#include "JointManager.h"

enum CalPhase
{
  CAL_IDLE,
  CAL_FAST_FORWARD,
  CAL_BACKOFF,
  CAL_SLOW_APPROACH,
  CAL_FINAL_OFFSET
};

class CalibrationManager
{
public:
  static CalibrationManager &instance();

  void begin();
  void update();
  void homeJoint(size_t joint, float fastDegPerSec, float slowDegPerSec);

  void stopAllMotors();
  float getMinPos(size_t joint) const;
  float getMaxPos(size_t joint) const;

  bool isHoming() const;
  void abortHoming();

private:
  CalibrationManager();

  CalPhase phase;
  size_t jobJoint;
  float fastSpeed, slowSpeed, backoffAngle;
  float minPos[CONFIG_JOINT_COUNT];
  float maxPos[CONFIG_JOINT_COUNT];
  float zeroPos[CONFIG_JOINT_COUNT]; // homeOffset
  unsigned long backoffStartMs = 0;
  bool backoffCleared;
};

#endif // CALIBRATION_MANAGER_H
