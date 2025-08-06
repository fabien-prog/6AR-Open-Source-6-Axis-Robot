// JointManager.h

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
};

class JointManager
{
public:
  static JointManager &instance();

  /// Call once in setup();
  void begin();

  /// Move joint #[0…5] to targetDeg (°) with vMax (°/s) and aMax (°/s²)
  bool move(size_t joint,
            float targetDeg,
            float vMaxDegPerSec,
            float aMaxDegPerSec2);

  /// Start jogging joint # with signed speed (°/s) and accel (°/s²)
  bool jog(size_t joint,
           float targetDegPerSec,
           float accelDegPerSec2);

  /// Stop any jog on that joint immediately
  void stopJog(size_t joint);

  /// Emergency‐stop everything
  void stopAll();

  /// Queries
  bool isMoving(size_t joint = 0);
  bool isAnyMoving();
  bool allJointsNearTarget(long thresholdSteps = 0);

  /// Position control
  void resetPosition(size_t joint, float newDeg);
  float getPosition(size_t joint);
  float getTarget(size_t joint); // always NaN
  float getSpeed(size_t joint);  // always 0
  float getAccel(size_t joint);  // always 0

  /// Soft limits
  void setSoftLimits(size_t joint, float minDeg, float maxDeg);
  void getSoftLimits(size_t joint, float &minDeg, float &maxDeg);

  /// Tuning
  void setMaxSpeed(size_t joint, float maxDegPerSec);
  float getMaxSpeed(size_t joint);
  void setMaxAccel(size_t joint, float maxDegPerSec2);
  float getMaxAccel(size_t joint);

private:
  JointManager();
  void _reloadCache(size_t joint);
  float _stepsPerDeg(size_t joint) const;

  JointCache _cache[CONFIG_JOINT_COUNT];
};

#endif // JOINT_MANAGER_H
