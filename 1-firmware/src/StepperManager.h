#ifndef STEPPER_MANAGER_H
#define STEPPER_MANAGER_H

#include <Arduino.h>
#include <IntervalTimer.h>
#include "Config.h"
#include "PinDef.h"

class StepperManager
{
public:
    static StepperManager &instance();

    void begin(uint32_t freqHz);
    void end();

    // One-off trapezoidal position move
    bool startMotion(size_t joint,
                     long deltaSteps,
                     float vStepsPerSec,
                     float aStepsPerSec2);

    // Continuous jog API (mode is kept alive until emergencyStop)
    bool startJog(size_t joint,
                  int dir,
                  float vStepsPerSec,
                  float aStepsPerSec2);
    void stopJog(size_t joint);

    // NEW: update jog targets without restarting the jog profile
    void setJogTarget(size_t joint,
                      float vStepsPerSec,
                      float aStepsPerSec2);
    void setJogTargetsAll(const float vStepsPerSec[CONFIG_JOINT_COUNT],
                          const float aStepsPerSec2[CONFIG_JOINT_COUNT]);

    // Smoothly command all axes toward 0 speed
    void setAllJogTargetsZero(float aStepsPerSec2);

    // Kill everything immediately
    void emergencyStop();

    bool isIdle() const;

    void resetPosition(size_t joint, long position);
    long getPosition(size_t joint) const;

    long getTargetSteps(size_t j) const;
    float getCurrentVelocity(size_t j) const;
    float getCurrentAccel(size_t j) const;

private:
    StepperManager();
    static void isrTrampoline();
    void isrHandler();

    bool _pulseHigh[CONFIG_JOINT_COUNT] = {false};

    IntervalTimer _timer;
    uint8_t _stepPins[CONFIG_JOINT_COUNT];
    uint8_t _dirPins[CONFIG_JOINT_COUNT];
    bool _isReversed[CONFIG_JOINT_COUNT];
    volatile long _positions[CONFIG_JOINT_COUNT];

    struct MotionPlan
    {
        bool active = false;
        size_t joint = 0;
        int dir = +1;
        long totalSteps = 0;
        long doneSteps = 0;
        long startPos = 0;
        float vMax = 0;
        float aMax = 0;
        float tAccel = 0;
        float tCruise = 0;
        float tTotal = 0;
        float elapsed = 0;
        float stepAcc = 0;
        float currentV = 0;
    } _motions[CONFIG_JOINT_COUNT];

    // Jog state per joint
    bool _jogActive[CONFIG_JOINT_COUNT] = {false};
    int _jogDir[CONFIG_JOINT_COUNT] = {0};
    float _jogTargetV[CONFIG_JOINT_COUNT] = {0};
    float _jogAccel[CONFIG_JOINT_COUNT] = {0};
    float _jogCurrentV[CONFIG_JOINT_COUNT] = {0};
    float _jogRem[CONFIG_JOINT_COUNT] = {0};

    float _dtSec = 0;

    static StepperManager *_inst;
};

#endif // STEPPER_MANAGER_H
