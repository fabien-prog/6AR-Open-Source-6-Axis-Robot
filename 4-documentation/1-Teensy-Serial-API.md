# Teensy Firmware Serial API Guide

This document describes the JSON-based serial interface to the 6-axis robot firmware running on the Teensy 4.1. All commands are newline-delimited JSON objects sent over Serial2 at **115200 baud**. Responses are also newline-delimited JSON objects.

---

## ⚙️ Communication Overview

* **Port**: `Serial2` (hardware UART)
* **Baud Rate**: `115200`
* **Format**: ASCII JSON, 1 command per line
* **Handler Location**: `CommManager.cpp`

---

## 📤 Request Format

```json
{ "cmd": "CommandName", ...additional_fields }
```

## 📥 Response Format

```json
{ "cmd": "CommandName", "status": "ok" }
{ "cmd": "CommandName", "status": "error", "error": "description" }
```

Some commands return data:

```json
{ "cmd": "systemStatus", "data": { "uptime": 12345, "estop": 0, "homing": 0 } }
```

---

## 🧾 Command List

### 1. `GetInputs`

Returns E-stop, 12 digital buttons, and 6 limit switches.

```json
{ "cmd": "GetInputs" }
```

Response:

```json
{
  "cmd": "inputStatus",
  "data": {
    "estop": 0,
    "buttons": [0, 1, 0, ...],
    "limits": [0, 0, 1, ...]
  }
}
```

### 2. `GetOutputs`

Returns 9 output (relay) states.

```json
{ "cmd": "GetOutputs" }
```

Response:

```json
{ "cmd": "outputStatus", "data": { "states": [0,1,0,...] } }
```

### 3. `GetSystemStatus`

Returns system uptime, estop state, and homing status.

```json
{ "cmd": "GetSystemStatus" }
```

Response:

```json
{
  "cmd": "systemStatus",
  "data": {
    "uptime": 123456,
    "estop": 0,
    "homing": 1
  }
}
```

### 4. `GetJointStatus`

Returns position, velocity, accel, target for a joint (1–6).

```json
{ "cmd": "GetJointStatus", "joint": 1 }
```

Response:

```json
{
  "cmd": "jointStatus",
  "data": {
    "joint": 1,
    "position": 12.34,
    "velocity": 5.67,
    "acceleration": 2.5,
    "target": 20.0
  }
}
```

### 5. `MoveTo`

Move joint to absolute target.

```json
{
  "cmd": "MoveTo",
  "joint": 2,
  "target": 45.0,
  "speed": 10.0,
  "accel": 5.0
}
```

Response: `{ "cmd": "moveTo", "status": "ok" }`

### 6. `MoveBy`

Relative joint movement.

```json
{
  "cmd": "MoveBy",
  "joint": 3,
  "delta": -10.0,
  "speed": 8.0,
  "accel": 4.0
}
```

### 7. `MoveMultiple`

Move multiple joints in sync. (Main movement command)

```json
{
  "cmd": "MoveMultiple",
  "joints": [1,2,3,4,5,6],
  "targets": [10,20,30,30,30,30],
  "speeds": [5,5,5,5,5,5],
  "accels": [2,2,2,2,2,2]
}
```

### 8. `Jog`

Jog a joint at a speed (± deg/s).

```json
{ "cmd": "Jog", "joint": 4, "speed": 12.0 }
```

### 9. `Stop`

Stop a specific joint.

```json
{ "cmd": "Stop", "joint": 4 }
```

### 10. `StopAll`

Stops all jogging and motion.

```json
{ "cmd": "StopAll" }
```

### 11. `Home`

Run homing routine for one joint.

```json
{ "cmd": "Home", "joint": 1, "speedFast": 20.0, "speedSlow": 5.0 }
```

### 12. `AbortHoming`

Cancel homing in progress.

```json
{ "cmd": "AbortHoming" }
```

### 13. `IsHoming`

Returns if homing is in progress.

```json
{ "cmd": "IsHoming" }
```

Response:

```json
{ "cmd": "isHoming", "data": 0 }
```

### 14. `SetParam`

Stores a config value in EEPROM.

```json
{ "cmd": "SetParam", "key": "joint1.jointMin", "value": 0.0 }
```

### 15. `GetParam`

Reads a config value from EEPROM.

```json
{ "cmd": "GetParam", "key": "joint1.jointMin", "default": 0.0 }
```

### 16. `SetSoftLimits`, `GetSoftLimits`

Set or query motion bounds for a joint to EEPROM.

```json
{ "cmd": "SetSoftLimits", "joint": 1, "min": -90.0, "max": 90.0 }
{ "cmd": "GetSoftLimits", "joint": 1 }
```

### 17. `SetMaxSpeed`, `GetMaxSpeed`

```json
{ "cmd": "SetMaxSpeed", "joint": 2, "value": 25.0 }
{ "cmd": "GetMaxSpeed", "joint": 2 }
```

### 18. `SetMaxAccel`, `GetMaxAccel`

```json
{ "cmd": "SetMaxAccel", "joint": 2, "value": 12.5 }
{ "cmd": "GetMaxAccel", "joint": 2 }
```

### 19. `SetHomeOffset`, `GetHomeOffset`

```json
{ "cmd": "SetHomeOffset", "joint": 3, "value": -5.0 }
{ "cmd": "GetHomeOffset", "joint": 3 }
```

### 20. `SetPositionFactor`, `GetPositionFactor`

```json
{ "cmd": "SetPositionFactor", "joint": 4, "value": 1.0 }
{ "cmd": "GetPositionFactor", "joint": 4 }
```

### 21. `Output`

Set digital outputs.

```json
{ "cmd": "Output", "outputs": [0, 2], "states": [1, 0] }
```

### 22. `ListParameters`

Dumps all key-value param pairs.

```json
{ "cmd": "ListParameters" }
```

---

## 🔔 Asynchronous Events

These are emitted by the Teensy automatically:

* `inputStatus` – on estop change
* `homed` – after successful homing
* `log` – debug messages from firmware

Example:

```json
{ "cmd": "homed", "data": { "joint": 1, "min": -90, "max": 90 } }
```

---

## 🚨 Emergency Stop Behavior

* Triggered via ISR on estop pin
* Immediately sends updated `inputStatus`
* Blocks all motion
* Requires manual or software reset

---

## 🧩 Future Commands (Planned)

These commands are under development and may appear in future firmware updates:

### `QueueTrajectory`

Buffer and execute multi-step motion sequences. (Almost done)

### `SetZero`

Reset encoder or joint offset to current position.

### `GetEncoderPosition`

Return raw encoder counts or absolute joint position (for future encoder-equipped joints).

### `ColdRestart` and `HotRestart`

Software reboot of the Teensy system.

---

## 🛠️ Notes

* Commands are case-sensitive (`"cmd": "MoveTo"` not `"moveto"`)
* Most motion commands are rejected during E-stop
* Invalid JSON or malformed commands will be ignored silently or return `{ "status": "error" }`

---

## 📚 See Also

* `CommManager.cpp` – serial command parsing and dispatch logic
* `Config.cpp/h` – tunable motion and parameter storage
* `SafetyManager.cpp` – how estop and limits are enforced

---
