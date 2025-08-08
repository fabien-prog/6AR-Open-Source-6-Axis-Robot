#include "StepperManager.h"
#include <imxrt.h>
#include <cmath>

StepperManager *StepperManager::_inst = nullptr;

StepperManager &StepperManager::instance()
{
    static StepperManager mgr;
    return mgr;
}

StepperManager::StepperManager()
{
    _inst = this;
    for (size_t j = 0; j < CONFIG_JOINT_COUNT; ++j)
    {
        _stepPins[j] = JOINT_CONFIG[j].pulsePin;
        _dirPins[j] = JOINT_CONFIG[j].dirPin;
        _isReversed[j] = JOINT_CONFIG[j].isReversed;
        _positions[j] = 0;
    }
}

void StepperManager::begin(uint32_t freqHz)
{
    _dtSec = 1.0f / float(freqHz);
    uint32_t periodUs = uint32_t(1e6f / float(freqHz));
    for (size_t j = 0; j < CONFIG_JOINT_COUNT; ++j)
    {
        pinMode(_stepPins[j], OUTPUT);
        pinMode(_dirPins[j], OUTPUT);
        digitalWrite(_stepPins[j], LOW);
        digitalWrite(_dirPins[j], LOW);
        _motions[j].active = false;
        _jogActive[j] = false;
        _jogDir[j] = 0;
        _jogTargetV[j] = 0;
        _jogAccel[j] = 0;
        _jogCurrentV[j] = 0;
    }
    _timer.begin(isrTrampoline, periodUs);
}

void StepperManager::end()
{
    _timer.end();
}

bool StepperManager::startMotion(size_t joint,
                                 long deltaSteps,
                                 float vStepsPerSec,
                                 float aStepsPerSec2)
{
    if (joint >= CONFIG_JOINT_COUNT || deltaSteps == 0)
        return (deltaSteps == 0);

    // cancel jog on this joint
    _jogActive[joint] = false;

    auto &mp = _motions[joint];
    mp.joint = joint;
    mp.dir = (deltaSteps > 0 ? +1 : -1);
    mp.startPos = _positions[joint];
    mp.totalSteps = std::llabs(deltaSteps);
    mp.doneSteps = 0;
    mp.vMax = fabsf(vStepsPerSec);
    mp.aMax = fabsf(aStepsPerSec2);

    float tA_full = mp.vMax / mp.aMax;
    float dA_full = 0.5f * mp.aMax * tA_full * tA_full;
    if (mp.totalSteps < 2 * dA_full)
    {
        float vPeak = sqrtf(mp.totalSteps * mp.aMax);
        mp.vMax = vPeak;
        mp.tAccel = vPeak / mp.aMax;
        mp.tCruise = 0;
    }
    else
    {
        mp.tAccel = tA_full;
        mp.tCruise = (mp.totalSteps - 2 * dA_full) / mp.vMax;
    }
    mp.tTotal = 2 * mp.tAccel + mp.tCruise;
    mp.elapsed = 0;
    mp.stepAcc = 0;
    mp.currentV = 0;
    mp.active = true;

    bool raw = (mp.dir > 0);
    bool fin = raw ^ _isReversed[joint];
    digitalWriteFast(_dirPins[joint], fin ? HIGH : LOW);
    return true;
}

bool StepperManager::startJog(size_t joint,
                              int dir,
                              float vStepsPerSec,
                              float aStepsPerSec2)
{
    if (joint >= CONFIG_JOINT_COUNT)
        return false;

    // cancel position move on this joint
    _motions[joint].active = false;

    _jogActive[joint] = true;
    _jogDir[joint] = (dir >= 0 ? +1 : -1);
    _jogTargetV[joint] = fabsf(vStepsPerSec);
    _jogAccel[joint] = fabsf(aStepsPerSec2);
    _jogCurrentV[joint] = 0;
    _jogRem[joint] = 0;

    bool raw = (_jogDir[joint] > 0);
    bool fin = raw ^ _isReversed[joint];
    digitalWriteFast(_dirPins[joint], fin ? HIGH : LOW);
    return true;
}

void StepperManager::setJogTarget(size_t joint,
                                  float vStepsPerSec,
                                  float aStepsPerSec2)
{
    if (joint >= CONFIG_JOINT_COUNT)
        return;

    // enter jog mode if not already
    if (!_jogActive[joint])
    {
        startJog(joint, (vStepsPerSec >= 0 ? +1 : -1),
                 fabsf(vStepsPerSec), fabsf(aStepsPerSec2));
        return;
    }

    // update direction pin only if sign changed
    int newDir = (vStepsPerSec >= 0 ? +1 : -1);
    if (newDir != _jogDir[joint])
    {
        _jogDir[joint] = newDir;
        bool raw = (_jogDir[joint] > 0);
        bool fin = raw ^ _isReversed[joint];
        digitalWriteFast(_dirPins[joint], fin ? HIGH : LOW);
    }
    _jogTargetV[joint] = fabsf(vStepsPerSec);
    _jogAccel[joint] = fabsf(aStepsPerSec2);
}

void StepperManager::setJogTargetsAll(const float vStepsPerSec[CONFIG_JOINT_COUNT],
                                      const float aStepsPerSec2[CONFIG_JOINT_COUNT])
{
    for (size_t j = 0; j < CONFIG_JOINT_COUNT; ++j)
        setJogTarget(j, vStepsPerSec[j], aStepsPerSec2[j]);
}

void StepperManager::setAllJogTargetsZero(float aStepsPerSec2)
{
    for (size_t j = 0; j < CONFIG_JOINT_COUNT; ++j)
    {
        setJogTarget(j, 0.0f, aStepsPerSec2);
    }
}

void StepperManager::stopJog(size_t joint)
{
    if (joint < CONFIG_JOINT_COUNT)
        _jogActive[joint] = false;
}

void StepperManager::emergencyStop()
{
    for (size_t j = 0; j < CONFIG_JOINT_COUNT; ++j)
    {
        _jogActive[j] = false;
        _motions[j].active = false;
    }
}

bool StepperManager::isIdle() const
{
    for (size_t j = 0; j < CONFIG_JOINT_COUNT; ++j)
        if (_jogActive[j] || _motions[j].active)
            return false;
    return true;
}

void StepperManager::resetPosition(size_t j, long pos)
{
    if (j < CONFIG_JOINT_COUNT)
    {
        noInterrupts();
        _positions[j] = pos;
        interrupts();
    }
}

long StepperManager::getPosition(size_t j) const
{
    long p = 0;
    if (j < CONFIG_JOINT_COUNT)
    {
        noInterrupts();
        p = _positions[j];
        interrupts();
    }
    return p;
}

long StepperManager::getTargetSteps(size_t j) const
{
    const auto &mp = _motions[j];
    return mp.active ? (mp.startPos + mp.dir * mp.totalSteps)
                     : _positions[j];
}

float StepperManager::getCurrentVelocity(size_t j) const
{
    if (_motions[j].active)
        return _motions[j].currentV;
    if (_jogActive[j])
        return _jogCurrentV[j];
    return 0;
}

float StepperManager::getCurrentAccel(size_t j) const
{
    const auto &mp = _motions[j];
    if (mp.active)
    {
        if (mp.elapsed < mp.tAccel)
            return mp.aMax;
        else if (mp.elapsed < mp.tAccel + mp.tCruise)
            return 0;
        else if (mp.elapsed < mp.tTotal)
            return -mp.aMax;
        else
            return 0;
    }
    if (_jogActive[j])
        return _jogAccel[j];
    return 0;
}

void StepperManager::isrTrampoline()
{
    if (_inst)
        _inst->isrHandler();
}

void StepperManager::isrHandler()
{
    // clear previous pulse highs
    for (size_t j = 0; j < CONFIG_JOINT_COUNT; ++j)
    {
        if (_pulseHigh[j])
        {
            digitalWriteFast(_stepPins[j], LOW);
            _pulseHigh[j] = false;
        }
    }

    for (size_t j = 0; j < CONFIG_JOINT_COUNT; ++j)
    {
        float v = 0;
        int dir = 0;
        bool runMotion = false;

        auto &mp = _motions[j];
        if (mp.active)
        {
            mp.elapsed += _dtSec;
            if (mp.elapsed < mp.tAccel)
                v = mp.aMax * mp.elapsed;
            else if (mp.elapsed < mp.tAccel + mp.tCruise)
                v = mp.vMax;
            else if (mp.elapsed < mp.tTotal)
            {
                float td = mp.elapsed - (mp.tAccel + mp.tCruise);
                v = mp.vMax - mp.aMax * td;
                if (v < 0)
                    v = 0;
            }
            else
            {
                mp.active = false;
                continue;
            }
            if (v > mp.vMax)
                v = mp.vMax;
            dir = mp.dir;
            mp.currentV = v;
            runMotion = true;
        }
        else if (_jogActive[j])
        {
            // slew currentV toward targetV using accel
            float dv = _jogAccel[j] * _dtSec;
            float v0 = _jogCurrentV[j], vt = _jogTargetV[j];
            float v1 = (fabsf(vt - v0) <= dv) ? vt : (v0 + ((vt > v0) ? dv : -dv));
            _jogCurrentV[j] = v1;
            v = v1;
            dir = _jogDir[j];
            runMotion = (v1 > 0.0f);
        }

        if (!runMotion)
            continue;

        // accumulate fractional steps
        float &acc = mp.stepAcc; // reuse per-joint accumulator
        acc += v * _dtSec;
        int steps = int(floorf(acc));
        acc -= float(steps);

        if (mp.active && (mp.doneSteps + steps >= mp.totalSteps))
        {
            steps = mp.totalSteps - mp.doneSteps;
            mp.active = false;
        }
        mp.doneSteps += steps;

        while (steps-- > 0)
        {
            digitalWriteFast(_stepPins[j], HIGH);
            _pulseHigh[j] = true;
            _positions[j] += (dir > 0 ? +1 : -1);
        }
    }
}
