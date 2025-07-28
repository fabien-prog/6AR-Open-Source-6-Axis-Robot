#include "CalibrationManager.h"
#include "IOManager.h"
#include "SafetyManager.h"
#include "CommManager.h"
#include "JointManager.h"

// ctor: zero min/max
CalibrationManager::CalibrationManager()
    : phase(CAL_IDLE),
      jobJoint(0),
      fastSpeed(0.0f),
      slowSpeed(0.0f),
      backoffAngle(5.0f)
{
  for (size_t i = 0; i < CONFIG_JOINT_COUNT; ++i)
    minPos[i] = maxPos[i] = 0.0f;
}

CalibrationManager &CalibrationManager::instance()
{
  static CalibrationManager inst;
  return inst;
}

void CalibrationManager::begin()
{
  // JointManager already set up pins
}

bool CalibrationManager::isHoming() const
{
  return phase != CAL_IDLE;
}

void CalibrationManager::abortHoming()
{
  // kill any motion
  JointManager::instance().stopAll();
  // squash calibration pulses
  stopAllMotors();
  // clear state
  phase = CAL_IDLE;
}

void CalibrationManager::homeJoint(size_t joint, float reqFast, float reqSlow)
{
  if (phase != CAL_IDLE || joint >= CONFIG_JOINT_COUNT)
    return;
  // pull in any EEPROM‐stored homing speeds
  auto &CM = ConfigManager::instance();
  char key[32];
  snprintf(key, sizeof(key), "joint%u.homingSpeed", unsigned(joint + 1));
  float cfgFast = CM.getParameter(key,
                                  JOINT_CONFIG[joint].homingSpeed);
  snprintf(key, sizeof(key), "joint%u.slowHomingSpeed", unsigned(joint + 1));
  float cfgSlow = CM.getParameter(key,
                                  JOINT_CONFIG[joint].slowHomingSpeed);

  // clamp your requested speeds to those limits
  fastSpeed = min(reqFast, cfgFast);
  slowSpeed = min(reqSlow, cfgSlow);

  jobJoint = joint;

  JointManager::instance().jogJoint(joint, -fastSpeed);
  phase = CAL_FAST_FORWARD;
}

void CalibrationManager::update()
{
  IOManager::instance().update();
  SafetyManager::instance().runChecks();
  if (SafetyManager::instance().isEStopped())
  {
    JointManager::instance().stopAll();
    phase = CAL_IDLE;
    return;
  }

  auto &JM = JointManager::instance();
  auto &CM = ConfigManager::instance();
  // index in digitalStates for this joint's limit switch
  size_t limitIdx = BUTTON_COUNT + 1 + jobJoint;
  bool hit = IOManager::instance().isDigitalActive(limitIdx);

  // fetch any EEPROM overrides for jointMin / jointMax / homeOffset
  char key[32];
  snprintf(key, sizeof(key), "joint%u.jointMin", unsigned(jobJoint + 1));
  float cfgMin = CM.getParameter(key,
                                 JOINT_CONFIG[jobJoint].jointMin);
  snprintf(key, sizeof(key), "joint%u.jointMax", unsigned(jobJoint + 1));
  float cfgMax = CM.getParameter(key,
                                 JOINT_CONFIG[jobJoint].jointMax);
  snprintf(key, sizeof(key), "joint%u.homeOffset", unsigned(jobJoint + 1));
  float cfgOffset = CM.getParameter(key,
                                    JOINT_CONFIG[jobJoint].homeOffset);

  switch (phase)
  {

  case CAL_FAST_FORWARD:
    if (hit)
    {
      JM.stopJoint(jobJoint);
      // zero at the switch
      JM.resetPosition(jobJoint, cfgMin);

      // absolute backoff
      float backoffDeg = cfgMin + backoffAngle;
      JM.runJoint(jobJoint,
                  backoffDeg,
                  fastSpeed, fastSpeed * 2.0f,
                  /*clamp=*/true);
      phase = CAL_BACKOFF;
    }
    break;

  case CAL_BACKOFF:
    if (!JM.isMoving(jobJoint) && !hit)
    {
      // slow approach into switch
      float slowT = cfgMin - 5.0f;
      JM.runJoint(jobJoint,
                  slowT,
                  slowSpeed, slowSpeed * 10.0f,
                  /*clamp=*/false);
      phase = CAL_SLOW_APPROACH;
    }
    break;

  case CAL_SLOW_APPROACH:
    if (hit)
    {
      JM.stopJoint(jobJoint);

      // 1) reset your internal zero at the switch:
      JM.resetPosition(jobJoint, cfgMin);

      // 2) record your new user-space limits:
      //    switch is now 0, axis-alignment will be +0 → so min = –offset, max = jointMax–offset
      minPos[jobJoint] = cfgMin - cfgOffset;
      maxPos[jobJoint] = cfgMax - cfgOffset;

      float physT = (cfgOffset + cfgOffset);

      // 3) physically move *away* from the switch by homeOffset degrees:
      JM.runJoint(jobJoint,
                  /*target user-space deg=*/cfgOffset,
                  fastSpeed,
                  fastSpeed * 2.0f,
                  /*clamp=*/false);
      phase = CAL_FINAL_OFFSET;
    }
    break;

  case CAL_FINAL_OFFSET:
    // wait until that final run completes...
    if (!JM.isMoving(jobJoint))
    {
      // 4) now that you're physically at axis-alignment,
      //    re-zero user-space so that this position reads 0:
      JM.resetPosition(jobJoint, /*deg=*/0.0f);

      CommManager::instance()
          .sendHomingResponse(jobJoint,
                              minPos[jobJoint],
                              maxPos[jobJoint]);
      phase = CAL_IDLE;
    }
    break;

  case CAL_IDLE:
  default:
    break;
  }
}

void CalibrationManager::stopAllMotors()
{
  // abort any calibration pulses
  phase = CAL_IDLE;
  JointManager::instance().stopAll();
}

float CalibrationManager::getMinPos(size_t joint) const
{
  return (joint < CONFIG_JOINT_COUNT) ? minPos[joint] : 0.0f;
}

float CalibrationManager::getMaxPos(size_t joint) const
{
  return (joint < CONFIG_JOINT_COUNT) ? maxPos[joint] : 0.0f;
}