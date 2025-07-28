#ifndef PIN_DEF_H
#define PIN_DEF_H

#include <Arduino.h>

// === Buttons ===
// 12 user buttons, all normally LOW
constexpr size_t BUTTON_COUNT = 12;
extern const uint8_t BUTTON_PINS[BUTTON_COUNT];

// === Emergency Stop ===
// Active HIGH
enum : uint8_t
{
    PIN_ESTOP = 14
};

// === Limit Switches ===
// J1..J6, all normally LOW
constexpr size_t LIMIT_COUNT = 6;
extern const uint8_t LIMIT_PINS[LIMIT_COUNT];

// === Stepper Drivers ===
// J1..J6: direction and step pins
constexpr size_t STEPPER_COUNT = 6;
extern const uint8_t STEPPER_DIR_PINS[STEPPER_COUNT];
extern const uint8_t STEPPER_PULSE_PINS[STEPPER_COUNT];

// === Relays ===
// Relay 1..8 (active LOW), Compressor relay (active HIGH)
constexpr size_t RELAY_COUNT = 9;
extern const uint8_t RELAY_PINS[RELAY_COUNT];

// === UART to Raspberry Pi ===
extern const uint8_t PIN_UART_RX;
extern const uint8_t PIN_UART_TX;

#endif // PIN_DEF_H