#include <Arduino.h>
#include "ConfigManager.h"
#include "IOManager.h"
#include "SafetyManager.h"
#include "CalibrationManager.h"
#include "JointManager.h"
#include "CommManager.h"

void setup()
{
  Serial.begin(921600);

  ConfigManager::instance().begin();
  IOManager::instance().begin();
  CommManager::instance().begin(Serial2);
  SafetyManager::instance().begin();
  CalibrationManager::instance().begin();
  JointManager::instance().begin();
  // Start low‐level stepper ISR at 100 kHz
  StepperManager::instance().begin(100000);

  // 2) restore last-saved joint positions
  {
    float saved[CONFIG_JOINT_COUNT];
    ConfigManager::instance().loadJointPositions(saved, CONFIG_JOINT_COUNT);
    for (size_t j = 0; j < CONFIG_JOINT_COUNT; ++j)
    {
      JointManager::instance().resetPosition(j, saved[j]);
      Serial.printf("↺ Restored J%u = %.2f°\n", unsigned(j + 1), saved[j]);
    }
  }

  Serial.println("=== READY ===");
}

// 20 ms application tick — matches the Pi-side trajectory dt
static constexpr uint32_t LOOP_PERIOD_US = 20000;

void loop()
{
  // ── Fast path: runs every iteration ────────────────────────────────────
  // At 921600 baud the UART HW FIFO fills in ~0.5 ms; must drain continuously.
  CommManager::instance().poll();

  // Velocity sub-steps self-throttle via internal micros() gate.
  // With dt=20 ms and 50 subdivisions they fire every 400 µs (2.5 kHz);
  // gating this at 20 ms would drop 49 of every 50 sub-steps.
  CommManager::instance().handleBatchExecution();

  // ── 20 ms application tick ─────────────────────────────────────────────
  static uint32_t lastTickUs = 0;
  const uint32_t now = micros();
  if (now - lastTickUs < LOOP_PERIOD_US)
    return;
  lastTickUs += LOOP_PERIOD_US; // += keeps the period exact; avoids drift

  // Dispatch any complete JSON commands received since last tick
  CommManager::instance().processBufferedLines();

  // E-stop latch check and status-LED blink
  SafetyManager::instance().runChecks();

  // Homing state machine (phases measured in seconds, 20 ms is plenty)
  CalibrationManager::instance().update();

  // Auto-save joint positions on the falling edge of motion
  static bool wasMoving = false;
  const bool nowMoving = !StepperManager::instance().isIdle();
  if (wasMoving && !nowMoving)
  {
    float positions[CONFIG_JOINT_COUNT];
    for (size_t j = 0; j < CONFIG_JOINT_COUNT; ++j)
      positions[j] = JointManager::instance().getPosition(j);
    ConfigManager::instance().saveJointPositions(positions, CONFIG_JOINT_COUNT);
  }
  wasMoving = nowMoving;

  // Flush any pending deferred EEPROM writes
  ConfigManager::instance().update();

  // Debounce digital inputs
  IOManager::instance().update();
}
