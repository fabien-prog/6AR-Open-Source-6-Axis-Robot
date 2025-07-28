// JointManager.cpp

#include "JointManager.h"
#include "IOManager.h"
#include "SafetyManager.h"
#include <cstdlib>

// ─── Singleton ────────────────────────────────────────────────
JointManager &JointManager::instance()
{
    static JointManager inst;
    return inst;
}

// ─── Constructor ──────────────────────────────────────────────
JointManager::JointManager()
    : steppers{
          AccelStepper(AccelStepper::DRIVER, JOINT_CONFIG[0].pulsePin, JOINT_CONFIG[0].dirPin),
          AccelStepper(AccelStepper::DRIVER, JOINT_CONFIG[1].pulsePin, JOINT_CONFIG[1].dirPin),
          AccelStepper(AccelStepper::DRIVER, JOINT_CONFIG[2].pulsePin, JOINT_CONFIG[2].dirPin),
          AccelStepper(AccelStepper::DRIVER, JOINT_CONFIG[3].pulsePin, JOINT_CONFIG[3].dirPin),
          AccelStepper(AccelStepper::DRIVER, JOINT_CONFIG[4].pulsePin, JOINT_CONFIG[4].dirPin),
          AccelStepper(AccelStepper::DRIVER, JOINT_CONFIG[5].pulsePin, JOINT_CONFIG[5].dirPin)}
{
}

// ─── Initialization ───────────────────────────────────────────
void JointManager::begin()
{
    for (size_t j = 0; j < CONFIG_JOINT_COUNT; ++j)
    {
        auto &stepper = steppers[j];
        const auto &C = JOINT_CONFIG[j];
        stepper.setPinsInverted(C.isReversed, false);
        stepper.setMinPulseWidth(10);
        stepper.setMaxSpeed(0);
        stepper.setAcceleration(0);
    }
}

// ─── Service in loop() ────────────────────────────────────────
void JointManager::updateSteppers()
{
    for (size_t j = 0; j < CONFIG_JOINT_COUNT; ++j)
    {
        if (jogMode[j])
            steppers[j].runSpeed();
        else
            steppers[j].run();
    }
}

// ─── Core trapezoid + homeOffset move ────────────────────────
bool JointManager::runJoint(size_t j,
                            float targetDeg, // ← user-space degrees
                            float maxDps,
                            float accelDps2,
                            bool clampTarget)
{
    if (j >= CONFIG_JOINT_COUNT ||
        SafetyManager::instance().isEStopped())
        return false;

    // Jog/homing shortcut
    if (std::isnan(targetDeg))
        return jogJoint(j, maxDps);

    // 1) fetch parameters
    const auto &C = JOINT_CONFIG[j];
    auto &CM = ConfigManager::instance();
    char key[32];

    // physical limits & home offset
    snprintf(key, sizeof(key), "joint%u.jointMin", unsigned(j + 1));
    float cfgMin = CM.getParameter(key, C.jointMin);
    snprintf(key, sizeof(key), "joint%u.jointMax", unsigned(j + 1));
    float cfgMax = CM.getParameter(key, C.jointMax);
    snprintf(key, sizeof(key), "joint%u.homeOffset", unsigned(j + 1));
    float cfgHomeOffset = CM.getParameter(key, C.homeOffset);

    // speed & accel caps
    snprintf(key, sizeof(key), "joint%u.maxSpeed", unsigned(j + 1));
    float cfgMaxSpeed = CM.getParameter(key, C.maxJointSpeed);
    snprintf(key, sizeof(key), "joint%u.maxAccel", unsigned(j + 1));
    float cfgMaxAccel = CM.getParameter(key, C.maxAcceleration);

    // conversion factor
    snprintf(key, sizeof(key), "joint%u.positionFactor", unsigned(j + 1));
    float cfgFactor = CM.getParameter(key, C.positionFactor);

    // 2) clamp commanded speeds
    maxDps = min(maxDps, cfgMaxSpeed);
    accelDps2 = min(accelDps2, cfgMaxAccel);

    // 3) compute the **physical** goal (physTarget),
    //    then clamp *that* in [cfgMin…cfgMax]
    float physTarget = targetDeg + cfgHomeOffset;
    if (clampTarget)
        physTarget = constrain(physTarget, cfgMin, cfgMax);

    // 4) now convert physTarget → steps
    float stepsPerMotorDeg = JOINT_CONFIG[j].stepsPerRev * C.gearboxRatio / 360.0f;
    float stepsPerPhysicalDeg = stepsPerMotorDeg / cfgFactor;
    long targetStp = long(physTarget * stepsPerPhysicalDeg);
    float maxSpeedStp = maxDps * stepsPerPhysicalDeg;
    float accelStp2 = accelDps2 * stepsPerPhysicalDeg;

    // 5) hand off to AccelStepper
    jogMode[j] = false;
    auto &st = steppers[j];

    // 1) first tell it the acceleration for this segment
    st.setAcceleration(accelStp2);

    // 2) then set the new cruise speed
    st.setMaxSpeed(maxSpeedStp);

    // 3) finally queue the new target
    st.moveTo(targetStp);

    return true;
}

// ─── High-level wrappers ─────────────────────────────────────
bool JointManager::moveTo(size_t j, float t, float s, float a)
{
    return runJoint(j, t, s, a, true);
}

bool JointManager::moveBy(size_t j, float d, float s, float a)
{
    if (j >= CONFIG_JOINT_COUNT)
        return false;
    return moveTo(j, getPosition(j) + d, s, a);
}

// ─── Jog ─────────────────────────────────────────────────────
bool JointManager::jogJoint(size_t j, float degPerSec)
{
    if (j >= CONFIG_JOINT_COUNT ||
        SafetyManager::instance().isEStopped())
        return false;

    const auto &C = JOINT_CONFIG[j];
    float spd = constrain(degPerSec, -C.maxJointSpeed, C.maxJointSpeed);
    float stpDeg = stepsPerDeg(j);

    jogMode[j] = true;
    auto &st = steppers[j];
    st.setAcceleration(0);
    st.setMaxSpeed(fabs(spd * stpDeg));
    st.setSpeed(spd * stpDeg);
    return true;
}

// ─── Stop ────────────────────────────────────────────────────
void JointManager::stopJoint(size_t j)
{
    if (j >= CONFIG_JOINT_COUNT)
        return;
    jogMode[j] = false;
    steppers[j].stop();
}

void JointManager::stopAll()
{
    for (size_t j = 0; j < CONFIG_JOINT_COUNT; ++j)
        stopJoint(j);
}

// ─── Queries ─────────────────────────────────────────────────
bool JointManager::isMoving(size_t j)
{
    if (j >= CONFIG_JOINT_COUNT)
        return false;
    if (jogMode[j])
        return steppers[j].speed() != 0;
    else
        return steppers[j].distanceToGo() != 0;
}

bool JointManager::isAnyMoving()
{
    for (size_t j = 0; j < CONFIG_JOINT_COUNT; ++j)
        if (isMoving(j))
            return true;
    return false;
}

float JointManager::getPosition(size_t j)
{
    if (j >= CONFIG_JOINT_COUNT)
        return NAN;

    // 1) fetch config
    const auto &C = JOINT_CONFIG[j];
    auto &CM = ConfigManager::instance();
    char key[32];

    // home-offset
    snprintf(key, sizeof(key), "joint%u.homeOffset", unsigned(j + 1));
    float cfgHome = CM.getParameter(key, C.homeOffset);

    // position-factor
    snprintf(key, sizeof(key), "joint%u.positionFactor", unsigned(j + 1));
    float cfgFactor = CM.getParameter(key, C.positionFactor);

    // 2) compute steps→deg exactly as runJoint does:
    float stepsPerMotorDeg = C.stepsPerRev * C.gearboxRatio / 360.0f;
    float stepsPerPhysicalDeg = stepsPerMotorDeg / cfgFactor;

    // 3) read raw motor position, convert to “physical” deg,
    //    then subtract homeOffset → user-space deg
    float physDeg = steppers[j].currentPosition() / stepsPerPhysicalDeg;
    return physDeg - cfgHome;
}

float JointManager::getTarget(size_t j)
{
    if (j >= CONFIG_JOINT_COUNT || jogMode[j])
        return NAN;

    // 1) fetch config
    const auto &C = JOINT_CONFIG[j];
    auto &CM = ConfigManager::instance();
    char key[32];

    // home-offset
    snprintf(key, sizeof(key), "joint%u.homeOffset", unsigned(j + 1));
    float cfgHome = CM.getParameter(key, C.homeOffset);

    // position-factor
    snprintf(key, sizeof(key), "joint%u.positionFactor", unsigned(j + 1));
    float cfgFactor = CM.getParameter(key, C.positionFactor);

    // 2) compute steps→deg
    float stepsPerMotorDeg = C.stepsPerRev * C.gearboxRatio / 360.0f;
    float stepsPerPhysicalDeg = stepsPerMotorDeg / cfgFactor;

    // 3) read the stepper’s queued target position
    float physDeg = steppers[j].targetPosition() / stepsPerPhysicalDeg;
    float userDeg = physDeg - cfgHome;

    return (userDeg);
}

float JointManager::getSpeed(size_t j)
{
    if (j >= CONFIG_JOINT_COUNT)
        return NAN;
    return steppers[j].speed() / stepsPerDeg(j);
}

float JointManager::getAccel(size_t j)
{
    if (j >= CONFIG_JOINT_COUNT)
        return NAN;
    return steppers[j].acceleration() / stepsPerDeg(j);
}

// ─── resetPosition ──────────────────────────────────────────
void JointManager::resetPosition(size_t j, float deg)
{
    if (j >= CONFIG_JOINT_COUNT)
        return;

    // 1) figure out cfgHomeOffset and cfgFactor
    char key[32];
    snprintf(key, sizeof(key), "joint%u.homeOffset", unsigned(j + 1));
    float cfgHome = ConfigManager::instance()
                        .getParameter(key, JOINT_CONFIG[j].homeOffset);

    snprintf(key, sizeof(key), "joint%u.positionFactor", unsigned(j + 1));
    float cfgFactor = ConfigManager::instance()
                          .getParameter(key, JOINT_CONFIG[j].positionFactor);

    // 2) compute the **same** steps-per-physical-degree that runJoint uses
    const auto &C = JOINT_CONFIG[j];
    float stepsPerMotorDeg = C.stepsPerRev * C.gearboxRatio / 360.0f;
    float stepsPerPhysDeg = stepsPerMotorDeg / cfgFactor;

    // 3) set currentPosition in those units
    float phys = deg + cfgHome;
    steppers[j].setCurrentPosition(long(phys * stepsPerPhysDeg));
}

// ─── Soft-limits via EEPROM ──────────────────────────────────
void JointManager::setSoftLimits(size_t j, float minDeg, float maxDeg)
{
    char key[32];
    snprintf(key, sizeof(key), "joint%u.jointMin", unsigned(j + 1));
    ConfigManager::instance().setParameter(key, minDeg);
    snprintf(key, sizeof(key), "joint%u.jointMax", unsigned(j + 1));
    ConfigManager::instance().setParameter(key, maxDeg);
}

void JointManager::getSoftLimits(size_t j, float &minDeg, float &maxDeg) const
{
    char key[32];
    snprintf(key, sizeof(key), "joint%u.jointMin", unsigned(j + 1));
    minDeg = ConfigManager::instance()
                 .getParameter(key, JOINT_CONFIG[j].jointMin);
    snprintf(key, sizeof(key), "joint%u.jointMax", unsigned(j + 1));
    maxDeg = ConfigManager::instance()
                 .getParameter(key, JOINT_CONFIG[j].jointMax);
}

// ─── Speed/accel tuning via EEPROM ───────────────────────────
void JointManager::setMaxSpeed(size_t j, float maxDps)
{
    char key[32];
    snprintf(key, sizeof(key), "joint%u.maxSpeed", unsigned(j + 1));
    ConfigManager::instance().setParameter(key, maxDps);
}

float JointManager::getMaxSpeed(size_t j) const
{
    char key[32];
    snprintf(key, sizeof(key), "joint%u.maxSpeed", unsigned(j + 1));
    return ConfigManager::instance()
        .getParameter(key, JOINT_CONFIG[j].maxJointSpeed);
}

void JointManager::setMaxAccel(size_t j, float maxDps2)
{
    char key[32];
    snprintf(key, sizeof(key), "joint%u.maxAccel", unsigned(j + 1));
    ConfigManager::instance().setParameter(key, maxDps2);
}

float JointManager::getMaxAccel(size_t j) const
{
    char key[32];
    snprintf(key, sizeof(key), "joint%u.maxAccel", unsigned(j + 1));
    return ConfigManager::instance()
        .getParameter(key, JOINT_CONFIG[j].maxAcceleration);
}

// ─── Logging ─────────────────────────────────────────────────
void JointManager::startLogging(size_t j, unsigned long intervalMs)
{
    if (j < CONFIG_JOINT_COUNT)
    {
        logJoint = j;
        logInterval = intervalMs;
        lastLogMs = millis();
    }
}

void JointManager::stopLogging()
{
    logJoint = SIZE_MAX;
}

void JointManager::handleLogging()
{
    if (logJoint >= CONFIG_JOINT_COUNT)
        return;

    unsigned long now = millis();
    if (now - lastLogMs < logInterval)
        return;
    lastLogMs = now;

    float tgt = getTarget(logJoint);
    float pos = getPosition(logJoint);
    float spd = getSpeed(logJoint);
    if (isnan(tgt))
        tgt = pos;
}

// ─── Helper ───────────────────────────────────────────────────
float JointManager::stepsPerDeg(size_t j) const
{
    const auto &C = JOINT_CONFIG[j];
    return (C.stepsPerRev * C.gearboxRatio) / 360.0f;
}

bool JointManager::allJointsNearTarget(long thresholdSteps) {
    for (size_t j = 0; j < CONFIG_JOINT_COUNT; ++j) {
        // distanceToGo() returns remaining steps (signed)
        if (std::abs(steppers[j].distanceToGo()) > thresholdSteps) {
            return false;
        }
    }
    return true;
}