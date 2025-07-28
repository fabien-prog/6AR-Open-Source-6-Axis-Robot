#ifndef IO_MANAGER_H
#define IO_MANAGER_H

#include <Arduino.h>
#include "Config.h" // for DIGITAL_INPUT_CONFIG, RELAY_CONFIG

class IOManager
{
public:
  static IOManager &instance();

  /// Call once in setup()
  void begin();
  bool isReady();
  /// Call each loop() to debounce inputs
  void update();

  /// Read debounced button/limit/E-stop
  bool isDigitalActive(size_t idx) const;
  /// Convenience: 0..5 → limit switches J1..J6
  bool isLimitActive(size_t limitIdx) const;

  /// Drive one of the outputs (0-based index into RELAY_CONFIG)
  /// Returns true if index valid.
  bool setOutput(size_t idx, bool high);
  /// Read last state you set (or initState)
  bool getOutput(size_t idx) const;

private:
  IOManager();
  struct DigitalState
  {
    const char *name;
    uint8_t pin;
    bool activeLow;
    bool stableState;
    bool lastReading;
    uint32_t debounceUs;
    uint32_t lastChange;
  };
  static constexpr size_t INPUT_COUNT = DIGITAL_INPUT_COUNT_CFG;
  static constexpr size_t OUTPUT_COUNT = RELAY_COUNT_CFG;

  DigitalState digitalStates[INPUT_COUNT];
  bool outputStates[OUTPUT_COUNT];

  

  void readDigital(size_t i, uint32_t now);
};

#endif // IO_MANAGER_H
