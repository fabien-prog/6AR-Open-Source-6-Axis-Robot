#include <Arduino.h>
#include "IOManager.h"
#include "CommManager.h"
#include "CalibrationManager.h"
#include "SafetyManager.h"

void setup()
{
  Serial.begin(115200);

  // 1) config JSON + joint-EEPROM region
  ConfigManager::instance().begin();

  // 2) immediately restore last-saved positions
  {
    float saved[CONFIG_JOINT_COUNT];
    ConfigManager::instance().loadJointPositions(saved, CONFIG_JOINT_COUNT);
    for (size_t j = 0; j < CONFIG_JOINT_COUNT; ++j)
    {
      JointManager::instance().resetPosition(j, saved[j]);
      Serial.printf("↺ Restored J%u = %.2f°\n", unsigned(j + 1), saved[j]);
    }
  }

  IOManager::instance().begin();
  CommManager::instance().begin(Serial2);
  SafetyManager::instance().begin();
  CalibrationManager::instance().begin();
  JointManager::instance().begin();

  Serial.println("=== READY ===");
}

void loop()
{
  CommManager::instance().poll();
  CommManager::instance().processIncoming();
  CommManager::instance().processQueue();
  JointManager::instance().updateSteppers();
  JointManager::instance().handleLogging();
  CalibrationManager::instance().update();
  IOManager::instance().update();
  SafetyManager::instance().runChecks();
}
