#include "IOManager.h"
#include "Config.h"

IOManager &IOManager::instance()
{
    static IOManager inst;
    return inst;
}

IOManager::IOManager()
{
    // initialize digitalStates from DIGITAL_INPUT_CONFIG
    for (size_t i = 0; i < INPUT_COUNT; ++i)
    {
        auto const &cfg = DIGITAL_INPUT_CONFIG[i];
        digitalStates[i] = {
            cfg.name,
            cfg.pin,
            cfg.activeLow,
            false, // stableState
            false, // lastReading
            cfg.debounceMs * 1000u,
            0u // lastChange will be set in begin()
        };
    }
    // initialize outputs to their configured initState
    for (size_t o = 0; o < OUTPUT_COUNT; ++o)
    {
        outputStates[o] = RELAY_CONFIG[o].initState;
    }
}

void IOManager::begin()
{
    // Inputs: pull-up
    for (size_t i = 0; i < INPUT_COUNT; ++i)
    {
        auto &ds = digitalStates[i];
        pinMode(ds.pin, INPUT_PULLUP);
        ds.lastChange = micros();
        ds.lastReading = digitalRead(ds.pin) == HIGH;
        ds.stableState = ds.activeLow ? !ds.lastReading : ds.lastReading;
    }
    // Outputs
    for (size_t o = 0; o < OUTPUT_COUNT; ++o)
    {
        auto const &cfg = RELAY_CONFIG[o];
        pinMode(cfg.pin, OUTPUT);
        digitalWrite(cfg.pin, cfg.initState ? HIGH : LOW);
    }
    isReady(); // update green LED state
}

void IOManager::update()
{
    uint32_t now = micros();
    for (size_t i = 0; i < INPUT_COUNT; ++i)
    {
        readDigital(i, now);
        isReady(); // update green LED state
    }
}

void IOManager::readDigital(size_t i, uint32_t now)
{
    auto &ds = digitalStates[i];
    bool raw = digitalRead(ds.pin);
    bool active = ds.activeLow ? (raw == LOW) : (raw == HIGH);

    if (active != ds.lastReading)
    {
        ds.lastReading = active;
        ds.lastChange = now;
    }
    else if (now - ds.lastChange >= ds.debounceUs)
    {
        ds.stableState = ds.lastReading;
    }
}

bool IOManager::isDigitalActive(size_t idx) const
{
    return idx < INPUT_COUNT ? digitalStates[idx].stableState : false;
}

bool IOManager::isReady()
{
    // force estopped = *not* the raw stable state
    bool estopped = !isDigitalActive(BUTTON_COUNT);
    bool ready = !estopped;
    setOutput(0, ready);
    return ready;
}

bool IOManager::isLimitActive(size_t limitIdx) const
{
    // limitIdx: 0..5 → BUTTON_COUNT+1+limitIdx
    size_t idx = BUTTON_COUNT + 1 + limitIdx;
    return isDigitalActive(idx);
}

bool IOManager::setOutput(size_t idx, bool high)
{
    if (idx >= OUTPUT_COUNT)
        return false;
    auto const &cfg = RELAY_CONFIG[idx];
    digitalWrite(cfg.pin, high ? HIGH : LOW);
    outputStates[idx] = high;
    return true;
}

bool IOManager::getOutput(size_t idx) const
{
    return idx < OUTPUT_COUNT ? outputStates[idx] : false;
}
