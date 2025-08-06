// StepperManager.cpp

#include "StepperManager.h"
#include <imxrt.h> // for PIT0_IRQn & NVIC_SET_PRIORITY
#include <cmath>

StepperManager *StepperManager::_inst = nullptr;

// ─── singleton ─────────────────────────────────────────────
StepperManager &StepperManager::instance()
{
    static StepperManager mgr;
    return mgr;
}

StepperManager::StepperManager()
{
    _inst = this;
    // map pins & reversal
    for (size_t j = 0; j < CONFIG_JOINT_COUNT; ++j)
    {
        _stepPins[j] = JOINT_CONFIG[j].pulsePin;
        _dirPins[j] = JOINT_CONFIG[j].dirPin;
        _isReversed[j] = JOINT_CONFIG[j].isReversed;
        _positions[j] = 0;
    }
}

// ─── begin / end ──────────────────────────────────────────
void StepperManager::begin(uint32_t freqHz)
{
    _dtSec = 1.0f / float(freqHz);
    uint32_t periodUs = uint32_t(1e6f / float(freqHz));

    // pin setup
    for (size_t j = 0; j < CONFIG_JOINT_COUNT; ++j)
    {
        pinMode(_stepPins[j], OUTPUT);
        pinMode(_dirPins[j], OUTPUT);
        digitalWrite(_stepPins[j], LOW);
        digitalWrite(_dirPins[j], LOW);
    }

    // clear any existing plan
    _motion.active = false;
    for (size_t j = 0; j < CONFIG_JOINT_COUNT; ++j)
    {
        _jogActive[j] = false;
        _positions[j] = 0;
    }

    // start ISR
    _timer.begin(isrTrampoline, periodUs);
}

void StepperManager::end()
{
    _timer.end();
}

// ─── trapezoidal motion ───────────────────────────────────
bool StepperManager::startMotion(size_t joint,
                                 long deltaSteps,
                                 float vStepsPerSec,
                                 float aStepsPerSec2)
{
    if (joint >= CONFIG_JOINT_COUNT)
        return false;

    if (deltaSteps == 0)
        return true;

    // plan
    _motion.joint = joint;
    _motion.dir = (deltaSteps > 0 ? +1 : -1);
    _motion.totalSteps = std::llabs(deltaSteps);
    _motion.doneSteps = 0;
    _motion.vMax = vStepsPerSec;
    _motion.aMax = aStepsPerSec2;

    // compute times
    float tA_full = vStepsPerSec / aStepsPerSec2;
    float dA_full = 0.5f * aStepsPerSec2 * tA_full * tA_full;

    if (_motion.totalSteps < 2 * dA_full)
    {
        // triangular
        float vPeak = sqrtf(_motion.totalSteps * aStepsPerSec2);
        _motion.vMax = vPeak;
        _motion.tAccel = vPeak / aStepsPerSec2;
        _motion.tCruise = 0.0f;
    }
    else
    {
        // trapezoid
        _motion.tAccel = tA_full;
        _motion.tCruise = (_motion.totalSteps - 2 * dA_full) / vStepsPerSec;
    }
    _motion.tTotal = 2 * _motion.tAccel + _motion.tCruise;
    _motion.elapsed = 0.0f;
    _motion.remainder = 0.0f;
    _motion.active = true;

    // set direction pin once
    bool raw = (_motion.dir > 0);
    bool fin = raw ^ _isReversed[joint];
    digitalWriteFast(_dirPins[joint], fin ? HIGH : LOW);

    return true;
}

// ─── jog ───────────────────────────────────────────────────
bool StepperManager::startJog(size_t joint,
                              int dir,
                              float vStepsPerSec,
                              float aStepsPerSec2)
{
    if (joint >= CONFIG_JOINT_COUNT)
        return false;

    _jogActive[joint] = true;
    _jogDir[joint] = (dir >= 0 ? +1 : -1);
    _jogTargetV[joint] = vStepsPerSec;
    _jogAccel[joint] = aStepsPerSec2;
    _jogCurrentV[joint] = 0.0f;
    _jogRem[joint] = 0.0f;

    // set direction pin once
    bool raw = (_jogDir[joint] > 0);
    bool fin = raw ^ _isReversed[joint];
    digitalWriteFast(_dirPins[joint], fin ? HIGH : LOW);

    return true;
}

void StepperManager::stopJog(size_t joint)
{
    if (joint < CONFIG_JOINT_COUNT)
    {
        _jogActive[joint] = false;
        _jogCurrentV[joint] = 0.0f;
        _jogRem[joint] = 0.0f;
    }
}

void StepperManager::emergencyStop()
{
    _motion.active = false;
    for (size_t j = 0; j < CONFIG_JOINT_COUNT; ++j)
        _jogActive[j] = false;
}

// ─── idle check ────────────────────────────────────────────
bool StepperManager::isIdle() const
{
    if (_motion.active)
        return false;
    for (size_t j = 0; j < CONFIG_JOINT_COUNT; ++j)
        if (_jogActive[j])
            return false;
    return true;
}

// ─── position access ───────────────────────────────────────
void StepperManager::resetPosition(size_t j, long position)
{
    if (j < CONFIG_JOINT_COUNT)
    {
        noInterrupts();
        _positions[j] = position;
        interrupts();
    }
}

long StepperManager::getPosition(size_t j) const
{
    if (j >= CONFIG_JOINT_COUNT)
        return 0;
    noInterrupts();
    long p = _positions[j];
    interrupts();
    return p;
}

// ─── ISR ────────────────────────────────────────────────────
void StepperManager::isrTrampoline()
{
    if (_inst)
        _inst->isrHandler();
}

void StepperManager::isrHandler()
{
    // 1) handle trapezoid move
    if (_motion.active)
    {
        float t = _motion.elapsed + _dtSec;
        _motion.elapsed = t;

        float v;
        if (t < _motion.tAccel)
        {
            v = _motion.aMax * t;
        }
        else if (t < _motion.tAccel + _motion.tCruise)
        {
            v = _motion.vMax;
        }
        else if (t < _motion.tTotal)
        {
            float td = t - (_motion.tAccel + _motion.tCruise);
            v = _motion.vMax - _motion.aMax * td;
            if (v < 0)
                v = 0;
        }
        else
        {
            _motion.active = false;
            return;
        }
        if (v > _motion.vMax)
            v = _motion.vMax;

        float raw = v * _dtSec + _motion.remainder;
        unsigned steps = unsigned(floorf(raw));
        _motion.remainder = raw - float(steps);

        // clamp to remaining steps
        if (_motion.doneSteps + long(steps) >= _motion.totalSteps)
        {
            steps = unsigned(_motion.totalSteps - _motion.doneSteps);
            _motion.active = false;
        }
        for (unsigned i = 0; i < steps; ++i)
        {
            digitalWriteFast(_stepPins[_motion.joint], HIGH);
            delayMicroseconds(3);
            digitalWriteFast(_stepPins[_motion.joint], LOW);
            if (_motion.dir > 0)
                ++_positions[_motion.joint];
            else
                --_positions[_motion.joint];
        }
        _motion.doneSteps += long(steps);
    }

    // 2) handle jogs
    for (size_t j = 0; j < CONFIG_JOINT_COUNT; ++j)
    {
        if (!_jogActive[j])
            continue;

        float dv = _jogAccel[j] * _dtSec;
        float v0 = _jogCurrentV[j];
        float vt = _jogTargetV[j];
        float v1;

        if (v0 == 0.0f || vt == 0.0f)
        {
            v1 = vt;
        }
        else if (fabsf(vt - v0) <= dv)
        {
            v1 = vt;
        }
        else
        {
            v1 = v0 + (vt > v0 ? dv : -dv);
        }
        _jogCurrentV[j] = v1;

        float raw = v1 * _dtSec + _jogRem[j];
        unsigned steps = unsigned(floorf(raw));
        _jogRem[j] = raw - float(steps);

        for (unsigned i = 0; i < steps; ++i)
        {
            digitalWriteFast(_stepPins[j], HIGH);
            delayMicroseconds(3);
            digitalWriteFast(_stepPins[j], LOW);
            if (_jogDir[j] > 0)
                ++_positions[j];
            else
                --_positions[j];
        }
    }
}
