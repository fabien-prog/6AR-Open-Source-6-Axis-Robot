// JointManager.cpp

#include "JointManager.h"
#include "SafetyManager.h"
#include <cmath>

// ─── singleton ───────────────────────────────────────────────
JointManager &JointManager::instance()
{
    static JointManager inst;
    return inst;
}

// ─── ctor ────────────────────────────────────────────────────
JointManager::JointManager()
{
    for (size_t i = 0; i < CONFIG_JOINT_COUNT; ++i)
        _cache[i].dirty = true;
}

// ─── begin() ─────────────────────────────────────────────────
void JointManager::begin()
{
    // Pre‐fill caches
    for (size_t j = 0; j < CONFIG_JOINT_COUNT; ++j)
        _reloadCache(j);

    // Start low‐level stepper ISR
    StepperManager::instance().begin(15000);
}

// ─── Move API ────────────────────────────────────────────────
bool JointManager::move(size_t joint,
                        float targetDeg,
                        float vMaxDegPerSec,
                        float aMaxDegPerSec2)
{
    if (joint >= CONFIG_JOINT_COUNT ||
        SafetyManager::instance().isEStopped())
        return false;

    _reloadCache(joint);

    // current physical steps
    float physCurDeg = getPosition(joint);
    float physTgtDeg = targetDeg;
    float deltaDeg = physTgtDeg - physCurDeg;
    if (deltaDeg == 0.0f)
        return true;

    long deltaSteps = lroundf(deltaDeg * _cache[joint].stepsPerPhysDeg);
    float vStepsPerSec = vMaxDegPerSec * _cache[joint].stepsPerPhysDeg;
    float aStepsPerSec2 = aMaxDegPerSec2 * _cache[joint].stepsPerPhysDeg;

    return StepperManager::instance()
        .startMotion(joint,
                        deltaSteps,
                        vStepsPerSec,
                        aStepsPerSec2);
}

// ─── Jog API ─────────────────────────────────────────────────
bool JointManager::jog(size_t joint,
                       float targetDegPerSec,
                       float accelDegPerSec2)
{
    if (joint >= CONFIG_JOINT_COUNT ||
        SafetyManager::instance().isEStopped())
        return false;

    _reloadCache(joint);

    float vStepsPerSec = targetDegPerSec * _cache[joint].stepsPerPhysDeg;
    float aStepsPerSec2 = accelDegPerSec2 * _cache[joint].stepsPerPhysDeg;

    return StepperManager::instance()
        .startJog(joint,
                  (vStepsPerSec >= 0 ? +1 : -1),
                  fabsf(vStepsPerSec),
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

// ─── Position control ───────────────────────────────────────
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

float JointManager::getTarget(size_t) { return NAN; }
float JointManager::getSpeed(size_t) { return 0.0f; }
float JointManager::getAccel(size_t) { return 0.0f; }

// ─── Soft limits & tuning ───────────────────────────────────
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
    mn = ConfigManager::instance().getParameter(
        key, JOINT_CONFIG[j].jointMin);
    snprintf(key, sizeof(key), "joint%u.jointMax", unsigned(j + 1));
    mx = ConfigManager::instance().getParameter(
        key, JOINT_CONFIG[j].jointMax);
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
    return ConfigManager::instance().getParameter(
        key, JOINT_CONFIG[j].maxJointSpeed);
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
    return ConfigManager::instance().getParameter(
        key, JOINT_CONFIG[j].maxAcceleration);
}

// ─── private helpers ─────────────────────────────────────────
void JointManager::_reloadCache(size_t joint)
{
    if (!_cache[joint].dirty)
        return;

    const auto &C = JOINT_CONFIG[joint];
    char key[32];

    snprintf(key, sizeof(key), "joint%u.homeOffset", unsigned(joint + 1));
    _cache[joint].cfgHomeOffset = ConfigManager::instance()
                                      .getParameter(key, C.homeOffset);

    snprintf(key, sizeof(key), "joint%u.positionFactor", unsigned(joint + 1));
    _cache[joint].cfgFactor = ConfigManager::instance()
                                  .getParameter(key, C.positionFactor);

    snprintf(key, sizeof(key), "joint%u.maxSpeed", unsigned(joint + 1));
    _cache[joint].cfgMaxSpeed = ConfigManager::instance()
                                    .getParameter(key, C.maxJointSpeed);

    snprintf(key, sizeof(key), "joint%u.maxAccel", unsigned(joint + 1));
    _cache[joint].cfgMaxAccel = ConfigManager::instance()
                                    .getParameter(key, C.maxAcceleration);

    // recalc conversion
    _cache[joint].stepsPerPhysDeg = (C.stepsPerRev * C.gearboxRatio / 360.0f) / _cache[joint].cfgFactor;

    _cache[joint].cfgMin = C.jointMin;
    _cache[joint].cfgMax = C.jointMax;
    _cache[joint].dirty = false;
}

float JointManager::_stepsPerDeg(size_t joint) const
{
    const auto &C = JOINT_CONFIG[joint];
    return (C.stepsPerRev * C.gearboxRatio) / 360.0f;
}

// ─── Queries ─────────────────────────────────────────────────
bool JointManager::isMoving(size_t /*joint*/)
{
    return !StepperManager::instance().isIdle();
}

bool JointManager::isAnyMoving()
{
    return !StepperManager::instance().isIdle();
}

bool JointManager::allJointsNearTarget(long /*threshold*/)
{
    return StepperManager::instance().isIdle();
}