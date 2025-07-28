#ifndef SAFETY_MANAGER_H
#define SAFETY_MANAGER_H

#include <Arduino.h>
#include "IOManager.h"
#include "CommManager.h"
#include "CalibrationManager.h"
#include "JointManager.h"
#include "PinDef.h"
#include <functional>

class SafetyManager
{
public:
  static SafetyManager &instance();

  /// Call once in setup()
  void begin();

  /// Call every loop() to handle LEDs & reset logic
  void runChecks();

  /// True if we’re currently latched in E-stop
  bool isEStopped() const { return eStopped; }

  void triggerEstop();

  void setEstopCallbacks(std::function<void()> onEnter, std::function<void()> onExit);

private:
  SafetyManager();

  /// ISR on the E-stop pin (press)
  static void onEStopISR();

  void enterEStop();
  void exitEStop();
  void handleBlink();

  bool eStopped = false;
  unsigned long lastBlink = 0;
  bool ledState = false;

  static constexpr unsigned long BLINK_MS = 500; // 2 Hz

  // your RELAY_CONFIG indices for LEDs:
  static constexpr uint8_t RED_LED_RELAY = 1;
  static constexpr uint8_t YELLOW_LED_RELAY = 2;

  std::function<void()> cbOnEnter;
  std::function<void()> cbOnExit;
};

#endif // SAFETY_MANAGER_H
