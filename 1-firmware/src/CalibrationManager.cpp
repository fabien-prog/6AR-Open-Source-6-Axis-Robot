// CalibrationManager.cpp

#include "CalibrationManager.h"
#include "IOManager.h"
#include "SafetyManager.h"
#include "CommManager.h"
#include "JointManager.h"
#include "ConfigManager.h"
#include <cmath>

// ─── ctor: zero min/max ───────────────────────────────────────
CalibrationManager::CalibrationManager()
    : phase(CAL_IDLE),
      jobJoint(0),
      fastSpeed(0.0f),
      slowSpeed(0.0f),
      backoffAngle(7.0f),
      backoffCleared(false)
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
  // JointManager already started in setup()
}

bool CalibrationManager::isHoming() const
{
  return phase != CAL_IDLE;
}

void CalibrationManager::abortHoming()
{
  // stop any pending jog or move
  JointManager::instance().stopJog(jobJoint);
  JointManager::instance().stopAll();
  phase = CAL_IDLE;
}

void CalibrationManager::homeJoint(size_t joint,
                                   float reqFast,
                                   float reqSlow)
{
  if (phase != CAL_IDLE || joint >= CONFIG_JOINT_COUNT)
    return;

  auto &CM = ConfigManager::instance();
  char key[32];

  // EEPROM limits
  snprintf(key, sizeof(key), "joint%u.homingSpeed", unsigned(joint + 1));
  float cfgFast = CM.getParameter(key, JOINT_CONFIG[joint].homingSpeed);
  snprintf(key, sizeof(key), "joint%u.slowHomingSpeed", unsigned(joint + 1));
  float cfgSlow = CM.getParameter(key, JOINT_CONFIG[joint].slowHomingSpeed);

  // clamp
  fastSpeed = fminf(reqFast, cfgFast);
  slowSpeed = fminf(reqSlow, cfgSlow);

  jobJoint = joint;

  // 1) fast jog into the switch
  JointManager::instance().jog(jobJoint, -fastSpeed, fastSpeed * 2.0f);
  phase = CAL_FAST_FORWARD;
}

void CalibrationManager::update()
{
  IOManager::instance().update();
  SafetyManager::instance().runChecks();
  if (SafetyManager::instance().isEStopped())
  {
    abortHoming();
    return;
  }

  auto &JM = JointManager::instance();
  auto &CM = ConfigManager::instance();

  // which digital input maps to this joint’s switch?
  size_t limitIdx = BUTTON_COUNT + 1 + jobJoint;
  bool hit = IOManager::instance().isDigitalActive(limitIdx);

  // fetch stored parameters
  char key[32];
  snprintf(key, sizeof(key), "joint%u.jointMin", unsigned(jobJoint + 1));
  float cfgMin = CM.getParameter(key, JOINT_CONFIG[jobJoint].jointMin);
  snprintf(key, sizeof(key), "joint%u.jointMax", unsigned(jobJoint + 1));
  float cfgMax = CM.getParameter(key, JOINT_CONFIG[jobJoint].jointMax);
  snprintf(key, sizeof(key), "joint%u.homeOffset", unsigned(jobJoint + 1));
  float cfgOffset = CM.getParameter(key, JOINT_CONFIG[jobJoint].homeOffset);

  switch (phase)
  {
  // ─── fast trek toward switch ─────────────────────────────────
  case CAL_FAST_FORWARD:
    if (hit)
    {
      // hit! stop the jog, zero there, then back off
      JM.stopJog(jobJoint);
      StepperManager::instance().stopJog(jobJoint);
      JM.resetPosition(jobJoint, cfgMin);

      JM.move(jobJoint,
              cfgMin + backoffAngle,
              fastSpeed,
              fastSpeed * 2.0f);
      backoffCleared = false;
      phase = CAL_BACKOFF;
    }
    break;

    // ─── back-off completed? ─────────────────────────────────────
  case CAL_BACKOFF:
    // 1) Wait until the back-off move has finished
    if (!JM.isMoving(jobJoint))
    {
      // 2) Then wait until the switch actually clears
      if (!hit)
      {
        // saw the switch open?
        if (!backoffCleared)
        {
          backoffCleared = true;
          // still in CAL_BACKOFF until next loop
          break;
        }
        // now truly done with back-off: begin slow approach
        JM.jog(jobJoint, -slowSpeed, slowSpeed * 2.0f);
        phase = CAL_SLOW_APPROACH;
      }
      // if hit==true, we’re still on the switch: keep looping here
    }
    break;

  // ─── creep in until switch trips again ────────────────────────
  case CAL_SLOW_APPROACH:
    if (hit)
    {
      // second hit!
      JM.stopJog(jobJoint);
      JM.resetPosition(jobJoint, cfgMin);

      // record user-space limits
      minPos[jobJoint] = cfgMin - cfgOffset;
      maxPos[jobJoint] = cfgMax - cfgOffset;

      // final swing to exact homeOffset
      JM.move(jobJoint,
              cfgOffset,
              fastSpeed,
              fastSpeed * 2.0f);
      phase = CAL_FINAL_OFFSET;
    }
    break;

  // ─── final offset move done? ─────────────────────────────────
  case CAL_FINAL_OFFSET:
    if (!JM.isMoving(jobJoint))
    {
      // zero at the true home
      JM.resetPosition(jobJoint, 0.0f);

      // tell the host we’re done
      CommManager::instance().sendHomingResponse(
          jobJoint,
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
  // same as abortHoming
  abortHoming();
}

float CalibrationManager::getMinPos(size_t joint) const
{
  return (joint < CONFIG_JOINT_COUNT) ? minPos[joint] : 0.0f;
}

float CalibrationManager::getMaxPos(size_t joint) const
{
  return (joint < CONFIG_JOINT_COUNT) ? maxPos[joint] : 0.0f;
}