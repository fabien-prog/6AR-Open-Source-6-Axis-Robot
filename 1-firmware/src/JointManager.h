#ifndef JOINT_MANAGER_H
#define JOINT_MANAGER_H

#include <cstddef>
#include <cmath>
#include "Config.h"
#include "ConfigManager.h"
#include "SafetyManager.h"
#include "StepperManager.h"

struct JointCache
{
  float cfgMin;
  float cfgMax;
  float cfgHomeOffset;
  float cfgFactor;
  float cfgMaxSpeed;
  float cfgMaxAccel;
  float stepsPerPhysDeg;
  bool dirty;
  float userMinDeg;
  float userMaxDeg;
};

class JointManager
{
public:
  static JointManager &instance();

  void begin();

  bool move(size_t joint,
            float targetDeg,
            float vMaxDegPerSec,
            float aMaxDegPerSec2,
            bool ignoreLimits = false);

  bool moveMultiple(const size_t *joints,
                    const float *targets,
                    const float *speeds,
                    const float *accels,
                    size_t count,
                    bool ignoreLimits = false);

  bool jog(size_t joint,
           float targetDegPerSec,
           float accelDegPerSec2);
  void stopJog(size_t joint);
  void stopAll();

  bool isMoving(size_t joint = 0);
  bool isAnyMoving();
  bool allJointsNearTarget(long thresholdSteps = 0);

  void resetPosition(size_t joint, float newDeg);
  float getPosition(size_t joint);
  float getTarget(size_t joint);
  float getSpeed(size_t joint);
  float getAccel(size_t joint);

  void setSoftLimits(size_t joint, float minDeg, float maxDeg);
  void getSoftLimits(size_t joint, float &minDeg, float &maxDeg);

  void setMaxSpeed(size_t joint, float maxDegPerSec);
  float getMaxSpeed(size_t joint);
  void setMaxAccel(size_t joint, float maxDegPerSec2);
  float getMaxAccel(size_t joint);

  // NEW: feed one velocity slice (deg/s, deg/s²) for all joints
  void feedVelocitySlice(const float speedsDegPerSec[CONFIG_JOINT_COUNT],
                         const float accelsDegPerSec2[CONFIG_JOINT_COUNT]);

  // NEW: command all joints to zero speed smoothly
  void setAllJogZero(float accelDegPerSec2);

private:
  JointManager();
  void _reloadCache(size_t joint);
  float _stepsPerDeg(size_t joint) const;

  JointCache _cache[CONFIG_JOINT_COUNT];
};

#endif // JOINT_MANAGER_H
