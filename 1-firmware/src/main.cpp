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

void loop()
{
  // 1) Read any incoming lines
  CommManager::instance().poll();

  // 2) Dispatch commands (unless a batch is mid-execution)
  CommManager::instance().processBufferedLines();

  // 3) E-stop & LED logic
  SafetyManager::instance().runChecks();

  // 4) If in EXECUTING state, feed the next mini-step
  CommManager::instance().handleBatchExecution();

  // 5) Homing state machine
  CalibrationManager::instance().update();

  // 5.1) Auto-save joint positions when motion stops
  static bool wasMoving = false;
  bool nowMoving = !StepperManager::instance().isIdle();
  if (wasMoving && !nowMoving)
  {
    // we just transitioned from moving → idle
    float positions[CONFIG_JOINT_COUNT];
    for (size_t j = 0; j < CONFIG_JOINT_COUNT; ++j)
    {
      positions[j] = JointManager::instance().getPosition(j);
    }
    ConfigManager::instance().saveJointPositions(positions, CONFIG_JOINT_COUNT);
  }
  wasMoving = nowMoving;

  // 6) Persist config if needed
  ConfigManager::instance().update();

  // 7) Digital I/O debounce/update
  IOManager::instance().update();
}
