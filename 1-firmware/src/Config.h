// src/Config.h

#ifndef CONFIG_H
#define CONFIG_H

#include <Arduino.h>
#include "PinDef.h"

// === Per-Joint Configuration ===
// Holds calibration & motion parameters for each joint,
// exactly 14 fields in the order you specified.
struct JointConfig
{
  const char *name;      //  1) human-readable name
  float maxMotorSpeed;   //  2) RPM
  float gearboxRatio;    //  3) gearbox ratio
  uint16_t stepsPerRev;  //  4) steps per revolution
  float maxAcceleration; //  5) deg/s²
  float homingSpeed;     //  6) fast homing (deg/s)
  float slowHomingSpeed; //  7) slow homing (deg/s)
  float jointMin;        //  8) endstop position (deg)
  float jointMax;        //  9) max from endstop (deg)
  float homeOffset;      // 10) “zero” offset from endstop (deg)
  bool isReversed;       // 11) direction flip
  uint8_t pulsePin;      // 12) step pulse pin
  uint8_t dirPin;        // 13) direction pin
  uint8_t unused;        // 14) _pad_ (to keep struct sizeof alignment; you can repurpose or remove if you like)

  // ← New PID gains (deg → deg/s output)
  float Kp;
  float Ki;
  float Kd;

  float maxJointSpeed;  // 15) max joint speed (deg/s)
  float positionFactor; // 18) scale factor for real joint output
};

constexpr size_t CONFIG_JOINT_COUNT = STEPPER_COUNT;
extern const JointConfig JOINT_CONFIG[CONFIG_JOINT_COUNT];

// === Buttons + E-Stop + Limit Switches ===
struct DigitalInputConfig
{
  const char *name;
  uint8_t pin;
  bool activeLow;
  uint32_t debounceMs;
};

// now: 12 buttons + 1 E-stop + 6 limit switches
constexpr size_t DIGITAL_INPUT_COUNT_CFG = BUTTON_COUNT + 1 + LIMIT_COUNT;
extern const DigitalInputConfig DIGITAL_INPUT_CONFIG[DIGITAL_INPUT_COUNT_CFG];

// === Relay Outputs Configuration ===
struct OutputConfig
{
  const char *name;
  uint8_t pin;
  bool initState;
};

constexpr size_t RELAY_COUNT_CFG = RELAY_COUNT;
extern const OutputConfig RELAY_CONFIG[RELAY_COUNT_CFG];

#endif // CONFIG_H
