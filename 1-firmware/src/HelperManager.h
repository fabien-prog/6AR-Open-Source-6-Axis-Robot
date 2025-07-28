#pragma once
#include <Arduino.h>

/// Persist joint positions and trigger a soft-reset without disabling motors.
class HelperManager {
public:
  static HelperManager& instance();
  void begin();
  void restart();
private:
  HelperManager() = default;
};