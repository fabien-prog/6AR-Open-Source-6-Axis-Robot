// src/Config.cpp

#include "Config.h"
#include "PinDef.h"

// ————————————————————————————————————————————————
// 1) Per-Joint Motion & Calibration Parameters
//    (14 fields each; one joint per block)
// ————————————————————————————————————————————————
const JointConfig JOINT_CONFIG[CONFIG_JOINT_COUNT] = {
    // — J1 —
    {
        "J1",                  //  1) name
        500.0f,                //  2) maxMotorSpeed (RPM)
        136.0f / 24.0f,        //  3) gearboxRatio
        6400,                  //  4) stepsPerRev
        25.0f,                 //  5) maxAcceleration (deg/s²)
        8.0f,                  //  6) homingSpeed (deg/s)
        3.0f,                  //  7) slowHomingSpeed (deg/s)
        0.0f,                  //  8) jointMin (deg)
        180.0f,                //  9) jointMax (deg)
        37.0f,                 // 10) homeOffset (deg)
        false,                 // 11) isReversed
        STEPPER_PULSE_PINS[0], // 12) pulsePin
        STEPPER_DIR_PINS[0],   // 13) dirPin
        0,                     // 14) unused (pad)
        25.0f,                 // 18) maxJointSpeed (deg/s)
        3.3333f                // 19) positionFactor
    },

    // — J2 —
    {
        "J2",                         //  1) name
        4000.0f,                      //  2) maxMotorSpeed
        75.0f / 24.0f * 5.0f * 27.0f, //  3) gearboxRatio
        400,                          //  4) stepsPerRev
        25.0f,                        //  5) maxAcceleration
        5.0f,                         //  6) homingSpeed
        2.0f,                         //  7) slowHomingSpeed
        0.0f,                         //  8) jointMin
        170.0f,                       //  9) jointMax
        10.0f,                        // 10) homeOffset
        false,                        // 11) isReversed
        STEPPER_PULSE_PINS[1],        // 12) pulsePin
        STEPPER_DIR_PINS[1],          // 13) dirPin
        0,                            // 14) unused (pad)
        60.0f,                        // 18) maxJointSpeed (deg/s)
        0.8333f                       // 19) positionFactor
    },

    // — J3 —
    {
        "J3",                         //  1) name
        4000.0f,                      //  2) maxMotorSpeed
        75.0f / 24.0f * 5.0f * 27.0f, //  3) gearboxRatio
        400,                          //  4) stepsPerRev
        150.0f,                       //  5) maxAcceleration
        10.0f,                        //  6) homingSpeed
        2.0f,                         //  7) slowHomingSpeed
        0.0f,                         //  8) jointMin
        250.0f,                       //  9) jointMax
        29.5f,                        // 10) homeOffset
        true,                         // 11) isReversed
        STEPPER_PULSE_PINS[2],        // 12) pulsePin
        STEPPER_DIR_PINS[2],          // 13) dirPin
        0,                            // 14) unused (pad)
        80.0f,                        // 18) maxJointSpeed (deg/s)
        0.8804f                       // 19) positionFactor
    },
    // — J4 —
    {
        "J4",                  //  1) name
        1200.0f,               //  2) maxMotorSpeed
        27.0f,                 //  3) gearboxRatio
        1600,                  //  4) stepsPerRev
        1800.0f,               //  5) maxAcceleration
        20.0f,                 //  6) homingSpeed
        3.0f,                  //  7) slowHomingSpeed
        0.0f,                  //  8) jointMin
        350.0f,                //  9) jointMax -0.4
        213.5f,                // 10) homeOffset
        true,                  // 11) isReversed
        STEPPER_PULSE_PINS[3], // 12) pulsePin
        STEPPER_DIR_PINS[3],   // 13) dirPin
        0,                     // 14) unused (pad)
        150.0f,                // 18) maxJointSpeed (deg/s)
        1.0f                   // 19) positionFactor

    },
    // — J5 —
    {
        "J5",                  //  1) name
        900.0f,                //  2) maxMotorSpeed
        20.0f,                 //  3) gearboxRatio
        1600,                  //  4) stepsPerRev
        250.0f,                //  5) maxAcceleration
        20.0f,                 //  6) homingSpeed
        3.0f,                  //  7) slowHomingSpeed
        0.0f,                  //  8) jointMin
        240.0f,                //  9) jointMax
        120.0f,                // 10) homeOffset
        false,                 // 11) isReversed
        STEPPER_PULSE_PINS[4], // 12) pulsePin
        STEPPER_DIR_PINS[4],   // 13) dirPin
        0,                     // 14) unused (pad)
        250.0f,                // 18) maxJointSpeed (deg/s)
        0.8411f                // 19) positionFactor
    },
    // — J6 —
    {
        "J6",                  //  1) name
        1200.0f,               //  2) maxMotorSpeed
        10.0f,                 //  3) gearboxRatio
        1600,                  //  4) stepsPerRev
        5600.0f,               //  5) maxAcceleration
        50.0f,                 //  6) homingSpeed
        3.0f,                  //  7) slowHomingSpeed
        0.0f,                  //  8) jointMin
        345.0f,                //  9) jointMax
        147.0f,                // 10) homeOffset
        false,                 // 11) isReversed
        STEPPER_PULSE_PINS[5], // 12) pulsePin
        STEPPER_DIR_PINS[5],   // 13) dirPin
        0,                     // 14) unused (pad)
        700.0f,                // 18) maxJointSpeed (deg/s)
        1.0f                   // 19) positionFactor
    }};
// ————————————————————————————————————————————————
// 2) Buttons + E-stop (activeLow, debounce)
// ————————————————————————————————————————————————
const DigitalInputConfig DIGITAL_INPUT_CONFIG[DIGITAL_INPUT_COUNT_CFG] = {
    // — Buttons 0…11 —
    {"BUTTON_GREEN_2", BUTTON_PINS[0], true, 20},
    {"BUTTON_GREEN_1", BUTTON_PINS[1], true, 20},
    {"BUTTON_YELLOW_2", BUTTON_PINS[2], true, 20},
    {"BUTTON_YELLOW_1", BUTTON_PINS[3], true, 20},
    {"BUTTON_RED_2", BUTTON_PINS[4], true, 20},
    {"BUTTON_RED_1", BUTTON_PINS[5], true, 20},
    {"BUTTON_BLUE_2", BUTTON_PINS[6], true, 20},
    {"BUTTON_BLUE_1", BUTTON_PINS[7], true, 20},
    {"BUTTON_BLACK_2", BUTTON_PINS[8], true, 20},
    {"BUTTON_BLACK_1", BUTTON_PINS[9], true, 20},
    {"BUTTON_WHITE_2", BUTTON_PINS[10], true, 20},
    {"BUTTON_WHITE_1", BUTTON_PINS[11], true, 20},

    // — E-Stop —
    {"E-Stop", PIN_ESTOP, false, 20},

    // — Limit switches J1…J6 —
    {"Limit J1", LIMIT_PINS[0], true, 10},
    {"Limit J2", LIMIT_PINS[1], true, 10},
    {"Limit J3", LIMIT_PINS[2], true, 10},
    {"Limit J4", LIMIT_PINS[3], true, 10},
    {"Limit J5", LIMIT_PINS[4], true, 10},
    {"Limit J6", LIMIT_PINS[5], true, 2},
};

// ————————————————————————————————————————————————
// 3) Relays (if you use them elsewhere)
// ————————————————————————————————————————————————
const OutputConfig RELAY_CONFIG[RELAY_COUNT_CFG] = {
    {"GREEN_LED", RELAY_PINS[0], true},
    {"RED_LED", RELAY_PINS[1], true},
    {"YELLOW_LED", RELAY_PINS[2], true},
    {"BUZZER", RELAY_PINS[3], true},
    {"SOLENOID_1_CLAW", RELAY_PINS[4], true},
    {"SOLENOID_2_UNUSED", RELAY_PINS[5], true},
    {"SOLENOID_3_UNUSED", RELAY_PINS[6], true},
    {"Relay 8", RELAY_PINS[7], true},
    {"COMPRESSOR", RELAY_PINS[8], false}};
