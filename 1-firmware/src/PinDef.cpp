#include "PinDef.h"

// Button pin assignments
const uint8_t BUTTON_PINS[BUTTON_COUNT] = {
    0, 1, 11, 12,
    24, 25, 34, 35,
    36, 37, 38, 39};

// Emergency Stop uses PIN_ESTOP constant

// Limit switch pin assignments
const uint8_t LIMIT_PINS[LIMIT_COUNT] = {
    10, 15, 32, 33,
    40, 41};

// Stepper driver pins
const uint8_t STEPPER_DIR_PINS[STEPPER_COUNT] = {26, 27, 28, 31, 30, 29};
const uint8_t STEPPER_PULSE_PINS[STEPPER_COUNT] = {2, 3, 4, 9, 6, 5};

// Relay pin assignments
const uint8_t RELAY_PINS[RELAY_COUNT] = {
    16, 17, 18, 19, 20,
    21, 22, 23, 13};

// UART pins
const uint8_t PIN_UART_RX = 7;
const uint8_t PIN_UART_TX = 8;