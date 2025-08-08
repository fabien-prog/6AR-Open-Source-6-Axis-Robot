# Teensy Firmware Serial API Guide (Current)

This document describes the **JSON‑over‑UART** interface for the Teensy 4.1 robot firmware.

- **Port**: `Serial2` (hardware UART, pins RX=7, TX=8)
- **Baud**: **921600**
- **Framing**: ASCII JSON, **1 object per line**, `\n` terminated
- **Handlers**: `CommManager.cpp`

> **ID echo:** If you include `"id"` in a request, firmware echoes it back in the reply. You should include an `id` in **every** command to keep Pi‑side ACK tracking reliable.

## Message Format

### Request

```json
{ "cmd": "CommandName", "...": "...", "id": 123 }
```

### Response (generic)

```json
{ "cmd": "CommandName", "status": "ok", "id": 123 }
{ "cmd": "CommandName", "status": "error", "error": "description", "id": 123 }
```

### Response (with data)

```json
{ "cmd": "systemStatus", "data": { "uptime": 123456, "estop": 0, "homing": 1 }, "id": 123 }
```

---

## Commands

### 1) `GetInputs`

Returns E‑stop, 12 buttons, and 6 limit switches (all **debounced**).

**Request**

```json
{ "cmd": "GetInputs", "id": 1 }
```

**Response**

```json
{
  "cmd": "inputStatus",
  "data": {
    "estop": 0,
    "buttons": [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    "limits": [0, 0, 0, 0, 0, 0]
  },
  "id": 1
}
```

---

### 2) `GetOutputs`

Returns 9 relay output states.

**Request**

```json
{ "cmd": "GetOutputs", "id": 2 }
```

**Response**

```json
{ "cmd": "outputStatus", "data": { "states": [0, 1, 0, 0, 0, 0, 0, 0, 1] }, "id": 2 }
```

---

### 3) `GetSystemStatus`

**Request**

```json
{ "cmd": "GetSystemStatus", "id": 3 }
```

**Response** _(from `handleGetSystemStatus`)_
`uptime` is in **milliseconds** (raw `millis()`).

```json
{ "cmd": "systemStatus", "data": { "uptime": 123456, "estop": 0, "homing": 0 }, "id": 3 }
```

---

### 4) `GetJointStatus`

- Omit `joint` → **all joints** (`jointStatusAll`)
- Include `joint` (1–6) → **single joint** (`jointStatus`)

**Request (all)**

```json
{ "cmd": "GetJointStatus", "id": 4 }
```

**Response**

```json
{
  "cmd": "jointStatusAll",
  "data": [
    { "joint":1,"position":0.0,"velocity":0,"acceleration":0,"target":0.0 },
    ...
  ],
  "id": 4
}
```

**Request (single)**

```json
{ "cmd": "GetJointStatus", "joint": 2, "id": 5 }
```

**Response**

```json
{
  "cmd": "jointStatus",
  "data": { "joint": 2, "position": 12.34, "velocity": 5.6, "acceleration": 2.5, "target": 20.0 },
  "id": 5
}
```

---

### 5) `MoveTo`

Absolute move with trapezoidal profile in the ISR driver.

**Request**

```json
{ "cmd": "MoveTo", "joint": 2, "target": 45.0, "speed": 10.0, "accel": 5.0, "id": 6 }
```

**Response**

```json
{ "cmd": "moveTo", "status": "ok", "id": 6 }
```

---

### 6) `MoveBy`

Relative move (`target = current + delta`).

**Request**

```json
{ "cmd": "MoveBy", "joint": 3, "delta": -10.0, "speed": 8.0, "accel": 4.0, "id": 7 }
```

**Response**

```json
{ "cmd": "moveBy", "status": "ok", "id": 7 }
```

---

### 7) `MoveMultiple`

Fire multiple `MoveTo` in one shot.

**Request**

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

**Response**

```json
{ "cmd": "moveMultiple", "status": "ok", "id": 8 }
```

> Arrays must be **same length**; joints are **1‑based** (1–6).

---

### 8) `Jog`

**Important:** Field names are `target` (deg/s) and `accel` (deg/s²).

**Request**

```json
{ "cmd": "Jog", "joint": 4, "target": 12.0, "accel": 120.0, "id": 9 }
```

**Response**

```json
{ "cmd": "jog", "status": "ok", "id": 9 }
```

---

### 9) `Stop` _(current behavior = global stop)_

`Stop` handler ignores the `joint` and performs a **global** stop.

**Request**

```json
{ "cmd": "Stop", "joint": 4, "id": 10 }
```

**Response**

```json
{ "cmd": "stop", "status": "ok", "id": 10 }
```

---

### 10) `StopAll`

Immediate stop of **all** motion and jog (no ramp).

**Request**

```json
{ "cmd": "StopAll", "id": 11 }
```

**Response**

```json
{ "cmd": "stopAll", "status": "ok", "id": 11 }
```

---

### 11) `Home`

Run 4‑phase homing for one joint. Speed requests are **clamped** to EEPROM config.

**Request**

```json
{ "cmd": "Home", "joint": 1, "speedFast": 20.0, "speedSlow": 5.0, "id": 12 }
```

**Response (ack)**

```json
{ "cmd": "home", "status": "ok", "id": 12 }
```

**Completion event**: see `homed` under **Asynchronous Events**.

---

### 12) `AbortHoming`

**Request**

```json
{ "cmd": "AbortHoming", "id": 13 }
```

**Response**

```json
{ "cmd": "abortHoming", "status": "ok", "id": 13 }
```

---

### 13) `IsHoming`

**Request**

```json
{ "cmd": "IsHoming", "id": 14 }
```

**Response**

```json
{ "cmd": "isHoming", "data": 0, "id": 14 }
```

---

### 14) EEPROM Parameter APIs

#### `SetParam`

```json
{ "cmd": "SetParam", "key": "joint1.jointMin", "value": 0.0, "id": 15 }
```

Response: `{ "cmd":"setParam","status":"ok","id":15 }`

#### `GetParam`

```json
{ "cmd": "GetParam", "key": "joint1.jointMin", "default": 0.0, "id": 16 }
```

Response:

```json
{ "cmd": "getParam", "data": { "key": "joint1.jointMin", "value": 0.0 }, "id": 16 }
```

#### `ListParameters`

Dumps all key→value pairs.

```json
{ "cmd": "ListParameters", "id": 17 }
```

- If the JSON buffer would overflow, you get:

```json
{ "cmd": "parameters", "status": "error", "error": "EEPROM overflow", "id": 17 }
```

---

### 15) Soft Limits / Max Speed / Max Accel / Home Offset / Position Factor

#### `SetSoftLimits` / `GetSoftLimits`

```json
{ "cmd":"SetSoftLimits","joint":1,"min":-90.0,"max":90.0,"id":18 }
{ "cmd":"GetSoftLimits","joint":1,"id":19 }
```

`GetSoftLimits` response:

```json
{ "cmd": "getSoftLimits", "data": { "joint": 1, "min": -90.0, "max": 90.0 }, "id": 19 }
```

#### `SetMaxSpeed` / `GetMaxSpeed`

```json
{ "cmd":"SetMaxSpeed","joint":2,"value":25.0,"id":20 }
{ "cmd":"GetMaxSpeed","joint":2,"id":21 }
```

`GetMaxSpeed` response:

```json
{ "cmd": "getMaxSpeed", "data": 25.0, "id": 21 }
```

#### `SetMaxAccel` / `GetMaxAccel`

```json
{ "cmd":"SetMaxAccel","joint":2,"value":12.5,"id":22 }
{ "cmd":"GetMaxAccel","joint":2,"id":23 }
```

`GetMaxAccel` response:

```json
{ "cmd": "getMaxAccel", "data": 12.5, "id": 23 }
```

#### `SetHomeOffset` / `GetHomeOffset`

```json
{ "cmd":"SetHomeOffset","joint":3,"value":-5.0,"id":24 }
{ "cmd":"GetHomeOffset","joint":3,"id":25 }
```

`GetHomeOffset` response:

```json
{ "cmd": "getHomeOffset", "data": -5.0, "id": 25 }
```

#### `SetPositionFactor` / `GetPositionFactor`

```json
{ "cmd":"SetPositionFactor","joint":4,"value":1.0,"id":26 }
{ "cmd":"GetPositionFactor","joint":4,"id":27 }
```

`GetPositionFactor` response:

```json
{ "cmd": "getPositionFactor", "data": 1.0, "id": 27 }
```

---

### 16) `Output`

Set multiple relay outputs at once.

- **Indices are 1‑based** in the request; firmware converts to 0‑based internally.
- `states` values are 0/1.

**Request**

```json
{ "cmd": "Output", "outputs": [1, 3], "states": [1, 0], "id": 28 }
```

**Response**

```json
{ "cmd": "output", "status": "ok", "id": 28 }
```

---

### 17) `Restart`

Saves current joint positions and performs a **soft reset**.

**Request**

```json
{ "cmd": "Restart", "id": 29 }
```

**Response (ack before reset)**

```json
{ "cmd": "Restart", "status": "ok", "id": 29 }
```

---

## Batch Velocity Streaming (High‑Rate Jog Slices)

Use this to stream time‑synchronized **velocity** segments (deg/s with deg/s² accel) for all joints.

### `BeginBatch`

- Starts loading `count` segments.
- `dt` is the **duration per segment** in seconds (must be > 0).
- On begin, the firmware preps jog mode at 0 speed to avoid discontinuities.

**Request**

```json
{ "cmd": "BeginBatch", "count": 100, "dt": 0.02, "id": 30 }
```

**Response**

```json
{ "cmd": "BeginBatch", "status": "ok", "id": 30 }
```

### `M` (Segment)

- One per segment; arrays must be length 6.
- `s`: speeds (deg/s), `a`: accelerations (deg/s²).
- Internally, each segment is sub‑divided into **50** sub‑steps for smoothness.

**Request**

```json
{ "cmd": "M", "s": [0, 10, 0, 0, 0, 0], "a": [0, 200, 0, 0, 0, 0], "id": 31 }
```

**Response**

```json
{ "cmd": "SegmentLoaded", "status": "ok", "id": 31 }
```

After last segment is loaded:

```json
{ "cmd": "BatchExecStart", "status": "ok" }
```

### Execution & Completion

`handleBatchExecution()` runs every loop and feeds sub‑steps to the stepper ISR via `JointManager::feedVelocitySlice`.
At the end:

```json
{ "cmd": "BatchComplete", "status": "ok" }
```

(Also ramps all joints to 0 speed gracefully.)

### `AbortBatch`

**Request**

```json
{ "cmd": "AbortBatch", "id": 32 }
```

**Response**

```json
{ "cmd": "BatchAborted", "status": "ok", "id": 32 }
```

> Limits are enforced in **position moves**. Batch is velocity‑mode; your host should ensure profiles keep joints inside allowed ranges (or stream a safe profile right after homing).

---

## Asynchronous Events

Emitted by firmware without request:

- **`inputStatus`** — on E‑stop/button/limit changes (same shape as `GetInputs` response).
- **`homed`** — after a joint finishes homing:

  ```json
  { "cmd": "homed", "data": { "joint": 1, "min": -90.0, "max": 90.0 } }
  ```

- **`BatchExecStart`**, **`SegmentLoaded`**, **`BatchComplete`**, **`BatchAborted`**
- **`log`** — diagnostic messages:

  ```json
  { "cmd": "log", "data": "text message" }
  ```

---

## Emergency Stop Behavior (summary)

- Hardware ISR triggers **immediate motion stop** and emits `inputStatus`.
- Latches until reset condition: **E‑stop released + GREEN button pressed**.
- During E‑stop, motion commands are rejected.

---

## Notes & Edge Cases

- **Case‑sensitive** `cmd` names (`"MoveTo"` not `"moveto"`).
- **`Stop` currently acts like `StopAll`** (global). If you need per‑joint soft stop, prefer streaming a batch that ramps that joint to 0.
- **`Output` indices are 1‑based** in the request.
- `GetSystemStatus` → `uptime` is **ms**. A separate internal helper may report `uptimeSec` in other code paths; client code should rely on the request/response pair above.
- `ListParameters` will return an **error** if the JSON would overflow (protects against truncated dumps).

---

## See Also

- `CommManager.*` — JSON parsing, command routing, **batch** loader/executor
- `JointManager.*` — deg‑space API, soft limits, velocity slice bridge
- `StepperManager.*` — 100 kHz ISR pulse engine (position + jog)
- `CalibrationManager.*` — homing FSM (fast → backoff 7° → slow → offset)
- `ConfigManager.*` — EEPROM JSON config + joint position persistence
- `SafetyManager.*`, `IOManager.*`, `HelperManager.*`, `Config.*`, `PinDef.*`

---
