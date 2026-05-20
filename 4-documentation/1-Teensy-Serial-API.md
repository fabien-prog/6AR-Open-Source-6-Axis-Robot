# Teensy Firmware Serial API

The Teensy 4.1 firmware speaks newline-delimited JSON over UART.

- port: `Serial2` on Teensy pins RX=7, TX=8
- baud: `921600`
- framing: one JSON object per line, terminated by `\n`
- handler file: `1-firmware/src/CommManager.cpp`

Include an `id` in every request. Firmware echoes that `id` in direct responses so the Pi bridge can match ACKs.

## Message Shape

Request:

```json
{ "cmd": "CommandName", "id": 123 }
```

Generic response:

```json
{ "cmd": "commandName", "status": "ok", "id": 123 }
{ "cmd": "commandName", "status": "error", "error": "description", "id": 123 }
```

Data response:

```json
{ "cmd": "systemStatus", "data": { "uptime": 123456, "estop": 0, "homing": 0 }, "id": 123 }
```

## Status and IO

### `GetInputs`

Returns E-stop, 12 buttons, and 6 limit switches.

```json
{ "cmd": "GetInputs", "id": 1 }
```

```json
{
  "cmd": "inputStatus",
  "data": {
    "estop": 0,
    "buttons": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    "limits": [0, 0, 0, 0, 0, 0]
  },
  "id": 1
}
```

### `GetOutputs`

Returns 9 relay output states.

```json
{ "cmd": "GetOutputs", "id": 2 }
```

```json
{ "cmd": "outputStatus", "data": { "states": [0, 1, 0, 0, 0, 0, 0, 0, 1] }, "id": 2 }
```

### `GetSystemStatus`

`uptime` is raw `millis()` in milliseconds.

```json
{ "cmd": "GetSystemStatus", "id": 3 }
```

```json
{ "cmd": "systemStatus", "data": { "uptime": 123456, "estop": 0, "homing": 0 }, "id": 3 }
```

### `GetJointStatus`

Omit `joint` for all joints, or pass a 1-based joint index for one joint.

```json
{ "cmd": "GetJointStatus", "id": 4 }
```

```json
{
  "cmd": "jointStatusAll",
  "data": [
    { "joint": 1, "position": 0, "velocity": 0, "acceleration": 0, "target": 0 }
  ],
  "id": 4
}
```

```json
{ "cmd": "GetJointStatus", "joint": 2, "id": 5 }
```

```json
{
  "cmd": "jointStatus",
  "data": { "joint": 2, "position": 12.34, "velocity": 5.6, "acceleration": 2.5, "target": 20 },
  "id": 5
}
```

## Position Motion

### `Move` / `MoveTo`

`Move` aliases `MoveTo`.

```json
{ "cmd": "MoveTo", "joint": 2, "target": 45, "speed": 10, "accel": 5, "id": 6 }
```

```json
{ "cmd": "moveTo", "status": "ok", "id": 6 }
```

### `MoveBy`

```json
{ "cmd": "MoveBy", "joint": 3, "delta": -10, "speed": 8, "accel": 4, "id": 7 }
```

```json
{ "cmd": "moveBy", "status": "ok", "id": 7 }
```

### `MoveMultiple`

All arrays must have the same length. Joint indexes are 1-based.

```json
{
  "cmd": "MoveMultiple",
  "joints": [1, 2, 3, 4, 5, 6],
  "targets": [10, 20, 30, 30, 30, 30],
  "speeds": [5, 5, 5, 5, 5, 5],
  "accels": [2, 2, 2, 2, 2, 2],
  "id": 8
}
```

```json
{ "cmd": "moveMultiple", "status": "ok", "id": 8 }
```

## Jog and Stop

### `Jog`

`target` is deg/s and `accel` is deg/s².

```json
{ "cmd": "Jog", "joint": 4, "target": 12, "accel": 120, "id": 9 }
```

```json
{ "cmd": "jog", "status": "ok", "id": 9 }
```

### `Stop`

Current firmware behavior is global stop, even when `joint` is provided.

```json
{ "cmd": "Stop", "joint": 4, "id": 10 }
```

```json
{ "cmd": "stop", "status": "ok", "id": 10 }
```

### `StopAll`

```json
{ "cmd": "StopAll", "id": 11 }
```

```json
{ "cmd": "stopAll", "status": "ok", "id": 11 }
```

## Homing

### `Home`

Runs one joint through fast approach, backoff, slow approach, and final offset.

```json
{ "cmd": "Home", "joint": 1, "speedFast": 20, "speedSlow": 5, "id": 12 }
```

```json
{ "cmd": "home", "status": "ok", "id": 12 }
```

Completion event:

```json
{ "cmd": "homed", "data": { "joint": 1, "min": -90, "max": 90 } }
```

### `AbortHoming`

```json
{ "cmd": "AbortHoming", "id": 13 }
```

```json
{ "cmd": "abortHoming", "status": "ok", "id": 13 }
```

### `IsHoming`

```json
{ "cmd": "IsHoming", "id": 14 }
```

```json
{ "cmd": "isHoming", "data": 0, "id": 14 }
```

## Live Velocity Streaming

### `SetVel`

Used by the Pi bridge for streamed linear motion. Both arrays must contain 6 values.

```json
{ "cmd": "SetVel", "s": [0, 0, 0, 0, 0, 0], "a": [100, 100, 100, 100, 100, 100], "id": 15 }
```

```json
{ "cmd": "SetVel", "status": "ok", "id": 15 }
```

`s` contains signed speeds in deg/s. `a` contains acceleration magnitudes in deg/s².

## Batch Velocity Upload

Batch mode preloads all segments and lets firmware execute them internally. Each segment is subdivided into 50 firmware-side velocity updates.

### `BeginBatch`

```json
{ "cmd": "BeginBatch", "count": 100, "dt": 0.02, "id": 16 }
```

```json
{ "cmd": "BeginBatch", "status": "ok", "id": 16 }
```

### `M`

```json
{ "cmd": "M", "s": [0, 10, 0, 0, 0, 0], "a": [0, 200, 0, 0, 0, 0], "id": 17 }
```

```json
{ "cmd": "SegmentLoaded", "status": "ok", "id": 17 }
```

After the last expected segment:

```json
{ "cmd": "BatchExecStart", "status": "ok" }
```

At the end:

```json
{ "cmd": "BatchComplete", "status": "ok" }
```

### `AbortBatch`

```json
{ "cmd": "AbortBatch", "id": 18 }
```

```json
{ "cmd": "BatchAborted", "status": "ok", "id": 18 }
```

## Parameters

### `ListParameters`

```json
{ "cmd": "ListParameters", "id": 19 }
```

```json
{ "cmd": "parameters", "data": { "params": { "joint1.maxSpeed": 100 } }, "id": 19 }
```

### `SetParam` / `GetParam`

```json
{ "cmd": "SetParam", "key": "joint1.jointMin", "value": -90, "id": 20 }
{ "cmd": "GetParam", "key": "joint1.jointMin", "default": 0, "id": 21 }
```

### Joint Parameter Helpers

```json
{ "cmd": "SetSoftLimits", "joint": 1, "min": -90, "max": 90, "id": 22 }
{ "cmd": "GetSoftLimits", "joint": 1, "id": 23 }
{ "cmd": "SetMaxSpeed", "joint": 1, "value": 100, "id": 24 }
{ "cmd": "GetMaxSpeed", "joint": 1, "id": 25 }
{ "cmd": "SetMaxAccel", "joint": 1, "value": 500, "id": 26 }
{ "cmd": "GetMaxAccel", "joint": 1, "id": 27 }
{ "cmd": "SetHomeOffset", "joint": 1, "value": 0, "id": 28 }
{ "cmd": "GetHomeOffset", "joint": 1, "id": 29 }
{ "cmd": "SetPositionFactor", "joint": 1, "value": 1, "id": 30 }
{ "cmd": "GetPositionFactor", "joint": 1, "id": 31 }
```

## Outputs and System

### `Output`

`outputs` are 1-based relay indexes.

```json
{ "cmd": "Output", "outputs": [1, 3], "states": [1, 0], "id": 32 }
```

```json
{ "cmd": "output", "status": "ok", "id": 32 }
```

### `Restart`

Saves current joint positions and performs a software reset.

```json
{ "cmd": "Restart", "id": 33 }
```

```json
{ "cmd": "Restart", "status": "ok", "id": 33 }
```

## Asynchronous Events

Firmware can emit these without a matching request:

- `inputStatus`: E-stop/button/limit state
- `homed`: one joint finished homing
- `SegmentLoaded`: batch segment accepted
- `BatchExecStart`: loaded batch started executing
- `BatchComplete`: batch finished
- `BatchAborted`: batch aborted
- `log`: diagnostic text

## Notes

- Command names are case-sensitive.
- `Stop` currently behaves like `StopAll`.
- `Output` indexes are 1-based in requests.
- `GetSystemStatus.data.uptime` is milliseconds.
- Position moves enforce soft limits in joint user space. Host-generated velocity streams should stay within safe limits.
