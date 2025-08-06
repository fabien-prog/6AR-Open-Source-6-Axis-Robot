// StepperManager.h

#ifndef STEPPER_MANAGER_H
#define STEPPER_MANAGER_H

#include <Arduino.h>
#include <IntervalTimer.h>
#include "Config.h" // for CONFIG_JOINT_COUNT
#include "PinDef.h" // for JOINT_CONFIG[]

class StepperManager
{
public:
    static StepperManager &instance();

    /// Kick off the ISR at freqHz (default 15 kHz)
    void begin(uint32_t freqHz = 15000);
    void end();

    /// One-off trapezoidal move on a single axis.
    ///   joint:        0…CONFIG_JOINT_COUNT-1
    ///   deltaSteps:   signed total steps to move
    ///   vStepsPerSec: peak speed in steps/sec
    ///   aStepsPerSec2:acceleration in steps/sec²
    bool startMotion(size_t joint,
                     long deltaSteps,
                     float vStepsPerSec,
                     float aStepsPerSec2);

    /// Continuous jog on one axis. dir = +1 or -1.
    bool startJog(size_t joint,
                  int dir,
                  float vStepsPerSec,
                  float aStepsPerSec2);

    /// Stop jog on that axis immediately.
    void stopJog(size_t joint);

    /// Hard stop everything.
    void emergencyStop();

    /// True if no motion or jog is active.
    bool isIdle() const;

    /// Absolute position control (in steps).
    void resetPosition(size_t joint, long position);
    long getPosition(size_t joint) const;

private:
    StepperManager();
    static void isrTrampoline();
    void isrHandler();

    IntervalTimer _timer;
    uint8_t _stepPins[CONFIG_JOINT_COUNT];
    uint8_t _dirPins[CONFIG_JOINT_COUNT];
    bool _isReversed[CONFIG_JOINT_COUNT];
    volatile long _positions[CONFIG_JOINT_COUNT];

    // ─── Motion plan ──────────────────────────────────────
    struct MotionPlan
    {
        bool active = false;
        size_t joint = 0;
        int dir = +1;
        long totalSteps = 0;
        long doneSteps = 0;
        float vMax = 0;
        float aMax = 0;
        float tAccel = 0;
        float tCruise = 0;
        float tTotal = 0;
        float elapsed = 0;
        float remainder = 0;
    } _motion;

    // ─── Jog state per joint ─────────────────────────────
    bool _jogActive[CONFIG_JOINT_COUNT] = {false};
    int _jogDir[CONFIG_JOINT_COUNT] = {0};
    float _jogTargetV[CONFIG_JOINT_COUNT] = {0};
    float _jogAccel[CONFIG_JOINT_COUNT] = {0};
    float _jogCurrentV[CONFIG_JOINT_COUNT] = {0};
    float _jogRem[CONFIG_JOINT_COUNT] = {0};

    float _dtSec = 0; // seconds per ISR tick
    static StepperManager *_inst;
};

#endif // STEPPER_MANAGER_H
