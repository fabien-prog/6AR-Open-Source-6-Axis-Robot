#include "JointManager.h"
#include "SafetyManager.h"
#include <cmath>

JointManager &JointManager::instance()
{
    static JointManager inst;
    return inst;
}

JointManager::JointManager()
{
    for (size_t i = 0; i < CONFIG_JOINT_COUNT; ++i)
        _cache[i].dirty = true;
}

void JointManager::begin()
{
    for (size_t j = 0; j < CONFIG_JOINT_COUNT; ++j)
        _reloadCache(j);
}

bool JointManager::move(size_t joint, float targetDeg, float vMaxDegPerSec, float aMaxDegPerSec2, bool ignoreLimits)
{
    if (joint >= CONFIG_JOINT_COUNT || SafetyManager::instance().isEStopped())
        return false;

    _reloadCache(joint);

    if (!ignoreLimits &&
        (targetDeg < _cache[joint].userMinDeg || targetDeg > _cache[joint].userMaxDeg))
        return false;

    float physCurDeg = getPosition(joint);
    float deltaDeg = targetDeg - physCurDeg;
    if (deltaDeg == 0.0f)
        return true;

    long deltaSteps = lroundf(deltaDeg * _cache[joint].stepsPerPhysDeg);
    float vStepsPerSec = fabsf(vMaxDegPerSec) * _cache[joint].stepsPerPhysDeg;
    float aStepsPerSec2 = fabsf(aMaxDegPerSec2) * _cache[joint].stepsPerPhysDeg;

    return StepperManager::instance().startMotion(joint, deltaSteps, vStepsPerSec, aStepsPerSec2);
}

bool JointManager::moveMultiple(const size_t *joints,
                                const float *targets,
                                const float *speeds,
                                const float *accels,
                                size_t count,
                                bool ignoreLimits)
{
    bool allOk = true;
    for (size_t i = 0; i < count; ++i)
    {
        size_t j = joints[i];
        if (j >= CONFIG_JOINT_COUNT)
        {
            allOk = false;
            continue;
        }
        bool ok = move(j, targets[i], speeds[i], accels[i], ignoreLimits);
        allOk &= ok;
    }
    return allOk;
}

bool JointManager::jog(size_t joint, float targetDegPerSec, float accelDegPerSec2)
{
    if (joint >= CONFIG_JOINT_COUNT || SafetyManager::instance().isEStopped())
        return false;
    _reloadCache(joint);

    float vStepsPerSec = fabsf(targetDegPerSec) * _cache[joint].stepsPerPhysDeg;
    float aStepsPerSec2 = fabsf(accelDegPerSec2) * _cache[joint].stepsPerPhysDeg;

    return StepperManager::instance().startJog(joint,
                                               (targetDegPerSec >= 0 ? +1 : -1),
                                               vStepsPerSec,
                                               aStepsPerSec2);
}

void JointManager::stopJog(size_t joint)
{
    if (joint < CONFIG_JOINT_COUNT)
        StepperManager::instance().stopJog(joint);
}

void JointManager::stopAll()
{
    StepperManager::instance().emergencyStop();
}

void JointManager::resetPosition(size_t j, float newDeg)
{
    if (j >= CONFIG_JOINT_COUNT)
        return;
    _reloadCache(j);
    long steps = lroundf(newDeg * _cache[j].stepsPerPhysDeg);
    StepperManager::instance().resetPosition(j, steps);
}

float JointManager::getPosition(size_t joint)
{
    long steps = StepperManager::instance().getPosition(joint);
    return float(steps) / _cache[joint].stepsPerPhysDeg;
}
float JointManager::getTarget(size_t joint)
{
    long tgt = StepperManager::instance().getTargetSteps(joint);
    return float(tgt) / _cache[joint].stepsPerPhysDeg;
}
float JointManager::getSpeed(size_t joint)
{
    float vSteps = StepperManager::instance().getCurrentVelocity(joint);
    return vSteps / _cache[joint].stepsPerPhysDeg;
}
float JointManager::getAccel(size_t joint)
{
    float aSteps = StepperManager::instance().getCurrentAccel(joint);
    return aSteps / _cache[joint].stepsPerPhysDeg;
}

void JointManager::setSoftLimits(size_t j, float mn, float mx)
{
    char key[32];
    snprintf(key, sizeof(key), "joint%u.jointMin", unsigned(j + 1));
    ConfigManager::instance().setParameter(key, mn);
    snprintf(key, sizeof(key), "joint%u.jointMax", unsigned(j + 1));
    ConfigManager::instance().setParameter(key, mx);
    _cache[j].dirty = true;
}

void JointManager::getSoftLimits(size_t j, float &mn, float &mx)
{
    char key[32];
    snprintf(key, sizeof(key), "joint%u.jointMin", unsigned(j + 1));
    mn = ConfigManager::instance().getParameter(key, JOINT_CONFIG[j].jointMin);
    snprintf(key, sizeof(key), "joint%u.jointMax", unsigned(j + 1));
    mx = ConfigManager::instance().getParameter(key, JOINT_CONFIG[j].jointMax);
    _cache[j].dirty = true;
}

void JointManager::setMaxSpeed(size_t j, float v)
{
    char key[32];
    snprintf(key, sizeof(key), "joint%u.maxSpeed", unsigned(j + 1));
    ConfigManager::instance().setParameter(key, v);
    _cache[j].dirty = true;
}
float JointManager::getMaxSpeed(size_t j)
{
    char key[32];
    snprintf(key, sizeof(key), "joint%u.maxSpeed", unsigned(j + 1));
    return ConfigManager::instance().getParameter(key, JOINT_CONFIG[j].maxJointSpeed);
}

void JointManager::setMaxAccel(size_t j, float a)
{
    char key[32];
    snprintf(key, sizeof(key), "joint%u.maxAccel", unsigned(j + 1));
    ConfigManager::instance().setParameter(key, a);
    _cache[j].dirty = true;
}
float JointManager::getMaxAccel(size_t j)
{
    char key[32];
    snprintf(key, sizeof(key), "joint%u.maxAccel", unsigned(j + 1));
    return ConfigManager::instance().getParameter(key, JOINT_CONFIG[j].maxAcceleration);
}

void JointManager::_reloadCache(size_t joint)
{
    if (!_cache[joint].dirty)
        return;

    const auto &C = JOINT_CONFIG[joint];
    char key[32];

    snprintf(key, sizeof(key), "joint%u.homeOffset", unsigned(joint + 1));
    _cache[joint].cfgHomeOffset = ConfigManager::instance().getParameter(key, C.homeOffset);

    snprintf(key, sizeof(key), "joint%u.positionFactor", unsigned(joint + 1));
    _cache[joint].cfgFactor = ConfigManager::instance().getParameter(key, C.positionFactor);

    snprintf(key, sizeof(key), "joint%u.maxSpeed", unsigned(joint + 1));
    _cache[joint].cfgMaxSpeed = ConfigManager::instance().getParameter(key, C.maxJointSpeed);

    snprintf(key, sizeof(key), "joint%u.maxAccel", unsigned(joint + 1));
    _cache[joint].cfgMaxAccel = ConfigManager::instance().getParameter(key, C.maxAcceleration);

    snprintf(key, sizeof(key), "joint%u.jointMin", unsigned(joint + 1));
    _cache[joint].cfgMin = ConfigManager::instance().getParameter(key, C.jointMin);

    snprintf(key, sizeof(key), "joint%u.jointMax", unsigned(joint + 1));
    _cache[joint].cfgMax = ConfigManager::instance().getParameter(key, C.jointMax);

    _cache[joint].stepsPerPhysDeg = (C.stepsPerRev * C.gearboxRatio / 360.0f) / _cache[joint].cfgFactor;
    _cache[joint].userMinDeg = _cache[joint].cfgMin - _cache[joint].cfgHomeOffset;
    _cache[joint].userMaxDeg = _cache[joint].cfgMax - _cache[joint].cfgHomeOffset;
    _cache[joint].dirty = false;
}

float JointManager::_stepsPerDeg(size_t joint) const
{
    const auto &C = JOINT_CONFIG[joint];
    return (C.stepsPerRev * C.gearboxRatio) / 360.0f;
}

bool JointManager::isMoving(size_t) { return !StepperManager::instance().isIdle(); }
bool JointManager::isAnyMoving() { return !StepperManager::instance().isIdle(); }
bool JointManager::allJointsNearTarget(long) { return StepperManager::instance().isIdle(); }

void JointManager::feedVelocitySlice(const float speedsDegPerSec[CONFIG_JOINT_COUNT],
                                     const float accelsDegPerSec2[CONFIG_JOINT_COUNT])
{
    float vSteps[CONFIG_JOINT_COUNT];
    float aSteps[CONFIG_JOINT_COUNT];
    for (size_t j = 0; j < CONFIG_JOINT_COUNT; ++j)
    {
        _reloadCache(j);
        vSteps[j] = speedsDegPerSec[j] * _cache[j].stepsPerPhysDeg; // signed
        aSteps[j] = fabsf(accelsDegPerSec2[j]) * _cache[j].stepsPerPhysDeg;
    }
    StepperManager::instance().setJogTargetsAll(vSteps, aSteps);
}

void JointManager::setAllJogZero(float accelDegPerSec2)
{
    float aSteps = fabsf(accelDegPerSec2) * _cache[0].stepsPerPhysDeg; // use J0 factor—close enough
    StepperManager::instance().setAllJogTargetsZero(aSteps);
}

