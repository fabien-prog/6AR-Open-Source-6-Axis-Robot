# Teensy Low‑Level Code — Full Overview (Current)

## High‑Level Architecture

The firmware is organized into managers that each own a single responsibility and interact through small, explicit APIs:

* **CommManager** — JSON over UART, command routing, *batch velocity streaming*.
* **JointManager** — user‑space motion API (deg), soft limits, caching, feeds ISR driver.
* **StepperManager** — 100 kHz ISR step pulse engine for position & jog/velocity mode.
* **CalibrationManager** — 4‑phase homing (fast, backoff, slow, final offset).
* **SafetyManager** — E‑stop, LED policy, motion kill & re‑arm logic.
* **IOManager** — debounced inputs (buttons, limits, E‑stop), relay outputs.
* **ConfigManager** — JSON config in EEPROM + joint position persistence.
* **HelperManager** — save positions + soft reset via AIRCR.
* **Config / PinDef** — all hardware & default motion parameters.

Everything runs **non‑blocking**; the only hard timing is in `StepperManager`’s ISR.

---

## CommManager

**Role**: Bridge between Pi (Node) and firmware over `Serial2`. Parses one JSON per line and dispatches to handlers. Provides a *batch execution* path for high‑rate velocity control.

### Transport

* **UART**: `Serial2` (RX=7, TX=8) at **921600 baud**.
* **Framing**: one JSON object per `\n`.

### Internal Queues & State

* **Raw line queue**: `RAW_QUEUE_MAX = 400`.
  `poll()` → accumulate chars → on `\n` push to queue.
* **Parser**: `processBufferedLines()` → `dispatchLine()`.
* **States**: `IDLE` | `LOADING` | `EXECUTING` for batch mode.

### Batch Velocity Streaming

* **Begin**: `{"cmd":"BeginBatch","count":N,"dt":0.02,"id":...}`
* **Segments**: `{"cmd":"M","s":[…6], "a":[…6]}`
  `s`=speeds (deg/s), `a`=accels (deg/s²), per joint.
* **Timing**: `dt` per segment, internally split into **50 sub‑steps** for smoothness.
* **Flow**:

  1. On `BeginBatch`: put all joints into **jog mode @ 0** (`setAllJogZero`) to align velocity updates.
  2. Load `N` segments; when loaded, switch to **EXECUTING** and call `handleBatchExecution()` each loop.
  3. For each segment, compute per‑substep accel increment and feed **`JointManager::feedVelocitySlice()`**.
  4. After last segment, bleed to zero and emit `BatchComplete`.

### Standard Commands (case‑sensitive)

* **Motion**: `Move`, `MoveTo`, `MoveBy`, `MoveMultiple`
* **Jog**: `Jog`, `Stop`, `StopAll`
* **Homing**: `Home`, `AbortHoming`, `IsHoming`
* **Status / I/O**: `GetInputs`, `GetOutputs`, `GetSystemStatus`, `GetJointStatus`

  * `GetJointStatus` supports **single joint** (returns `jointStatus`) or **all** (returns `jointStatusAll`).
* **Config**:
  `SetParam`, `GetParam`, `ListParameters`,
  `SetSoftLimits`,`GetSoftLimits`,
  `SetMaxSpeed`,`GetMaxSpeed`,
  `SetMaxAccel`,`GetMaxAccel`,
  `SetHomeOffset`,`GetHomeOffset`,
  `SetPositionFactor`,`GetPositionFactor`
* **Outputs**: `Output` (delegated to IOManager)
* **System**: `Restart` (delegated to HelperManager)
* **Batch**: `BeginBatch`, `M`, `AbortBatch`

### Response Shape & ID Echo

All handlers include `"id"` when provided:

```json
{ "cmd": "moveTo", "status": "ok", "id": 42 }
```

Many status replies pack payload under `"data"`:

* `jointStatusAll` → `data` is array of 6 `{ joint, position, velocity, acceleration, target }`.
* `systemStatus` → `data.uptimeSec`, `data.estop`, `data.homing`.

---

## JointManager

**Role**: Deg‑space API, soft‑limit enforcement, config cache, and velocity slice bridge to the ISR driver.

### Key APIs

* **Position moves**:
  `move(j, targetDeg, vMax, aMax, ignoreLimits=false)` → trapezoid in `StepperManager`.
  `moveMultiple(...)` → fires multiple `move()` in one go.
* **Jog / velocity mode**:
  `jog(j, targetDegPerSec, accelDegPerSec2)` (smooth slew)
  `feedVelocitySlice(speeds[6], accels[6])` for batch streaming.
  `setAllJogZero(accelDegPerSec2)` for graceful stop.
* **State**: `getPosition`, `getTarget`, `getSpeed`, `getAccel`, `isMoving()`.
* **Soft limits**: `setSoftLimits`, `getSoftLimits`.
* **Maxes**: `setMaxSpeed/getMaxSpeed`, `setMaxAccel/getMaxAccel`.
* **Reset**: `resetPosition(j, newDeg)` (writes steps into driver).

### Config Caching

Each joint caches:

* `cfgMin/cfgMax`, `cfgHomeOffset`, `cfgFactor` (positionFactor),
* `cfgMaxSpeed/Accel`,
* `stepsPerPhysDeg = (stepsPerRev*gearbox/360) / positionFactor`,
* `userMinDeg = cfgMin - cfgHomeOffset`, `userMaxDeg = cfgMax - cfgHomeOffset`.

Soft limits apply in **user space** unless `ignoreLimits=true`.

---

## StepperManager

**Role**: 100 kHz pulse engine with two concurrent modes per joint:

* **Position**: one‑shot trapezoidal profile.
* **Jog/Velocity**: continuously slews toward a target velocity with a given accel.

### Timing & Pins

* ISR @ **100 kHz** (`IntervalTimer`).
* Per‑joint step/dir pins from `PinDef`.
* Direction honors `isReversed`.

### Position Mode

* Computes accel, cruise, decel times; clamps to triangular if short move.
* Integrates velocity, accumulates fractional steps, outputs pulses.
* Tracks `currentV`, `elapsed`, and auto‑completes at target.

### Jog / Velocity Mode

* Slew `currentV` → `targetV` using `accel` every ISR tick.
* Direction pin flips only on sign change.
* Supports **global** updates (`setJogTargetsAll`) for batch sub‑steps.
* `setAllJogTargetsZero()` gracefully ramps to 0.

### Safety

* `emergencyStop()` cancels position and jog immediately.
* `isIdle()` returns true only when **no** joint is moving or jogging.

---

## CalibrationManager

**Role**: Deterministic, non‑blocking homing state machine.

### Phases (per joint)

1. **CAL\_FAST\_FORWARD** — Jog **toward** the switch at `fastSpeed` until hit.
2. **CAL\_BACKOFF** — Stop, **resetPosition(jointMin)**, back off **7°** at fast speed.
   Wait for motion to finish **and** confirm switch **cleared**.
3. **CAL\_SLOW\_APPROACH** — Jog slowly back toward the switch until hit.
4. **CAL\_FINAL\_OFFSET** — Stop, **resetPosition(jointMin)**, compute user limits:
   `minPos = jointMin - homeOffset`, `maxPos = jointMax - homeOffset`,
   then **move to `homeOffset` ignoring limits**. When done, **resetPosition(0°)** and emit `homed`.

### Details

* Requested speeds are **clamped** by EEPROM config (`homingSpeed`, `slowHomingSpeed`).
* Limit switch index mapping: `BUTTON_COUNT + 1 + jobJoint`.
* `AbortHoming`/`E‑stop` stops jog/move, clears state, and returns to `CAL_IDLE`.

---

## SafetyManager

**Role**: E‑stop policy & LEDs.

* E‑stop: **pressed → stop all motion**, send input status, blink red LED while held.
* **Reset** condition: E‑stop released **and** green button (index 0) pressed.
* Controls **RED** & **YELLOW** LEDs via relay outputs (active‑LOW).
* Exposes `isEStopped()` and callbacks on enter/exit (optional logging).

---

## IOManager

**Role**: Debounced inputs + relay outputs.

* **Inputs**: 12 buttons, 1 E‑stop, 6 limit switches.
  Each has `activeLow` and `debounceUs`.
  `isDigitalActive(i)` returns a **stable** value.
* **Limits**: `isLimitActive(k)` maps 0…5 → J1…J6.
* **Outputs**: 9 relays with configured `initState`.
  `setOutput(i,bool)`, `getOutput(i)`.
* **Ready LED**: `isReady()` sets GREEN LED based on E‑stop state.

---

## ConfigManager

**Role**: Persistent config & positions in EEPROM, with safe writeback.

* **Config JSON region**: `CFG_EEPROM_SIZE = 4284` bytes at `CFG_EEPROM_ADDR=0`.
* **Positions region**: floats stored at `CFG_JOINT_EEPROM_ADDR` (immediately after JSON).
* **Default fill** (`resetConfigToDefaults`) from `JOINT_CONFIG`:

  * `positionFactor`, `maxAccel`, `maxSpeed`, `homingSpeed`, `slowHomingSpeed`,
  * `jointMin`, `jointMax`, `homeOffset`.
* **Write coalescing**: `SAVE_DELAY_MS=1000` after last change.
* **API**: `setParameter/getParameter`, `getFullConfig`, `saveJointPositions/loadJointPositions`.

---

## HelperManager

**Role**: Save‑and‑reset.

1. Snapshot all joint positions (deg) from `JointManager`.
2. Persist via `ConfigManager::saveJointPositions`.
3. Delay 100 ms, then **SYSRESETREQ** via `SCB_AIRCR`.

---

## Config & PinDef

**`Config.cpp` (per‑joint defaults)**
Names, motor/gear data, `stepsPerRev`, max accel/speed, homing speeds, `jointMin/Max`, `homeOffset`, `isReversed`, pins, and `positionFactor`.

**`PinDef.cpp/h`**
All pins for buttons, E‑stop, limits, step/dir, relays, and UART.
Counts: `BUTTON_COUNT=12`, `LIMIT_COUNT=6`, `STEPPER_COUNT=6`, `RELAY_COUNT=9`.

---

## Communication Details (Quick Reference)

* **Port**: `Serial2` (7/8), **921600** baud.
* **Protocol**: 1 JSON per line, newline‑terminated.
* **Batch**:

  * `BeginBatch`: `{cmd,count,dt}`
  * `M`: `{cmd:"M", s:[6], a:[6]}`
  * Substeps: **50**/segment
* **Examples**:

  * Single move: `{"cmd":"MoveTo","joint":5,"target":92,"speed":80,"accel":90,"id":7}`
  * Jog: `{"cmd":"Jog","joint":3,"target":-40,"accel":120,"id":8}`
  * Status‑all: `{"cmd":"GetJointStatus","id":9}` → `jointStatusAll`
  * Status‑one: `{"cmd":"GetJointStatus","joint":2,"id":10}` → `jointStatus`

All replies preserve the incoming `"id"`.

---

## Boot Sequence

1. `ConfigManager.begin()` → load (or default) JSON config.
2. `IOManager.begin()` → set inputs/outputs.
3. `CommManager.begin(Serial2)` → link up.
4. `SafetyManager.begin()` → E‑stop + LEDs.
5. `CalibrationManager.begin()` → ready the homing FSM.
6. `JointManager.begin()` → cache per‑joint config.
7. **Stepper ISR**: `StepperManager.begin(100000)` (100 kHz).
8. **Restore positions**: load last saved joint angles and `resetPosition` per joint.
9. Print `=== READY ===`.

---

## Main Loop (Current)

```cpp
void loop() {
  CommManager::instance().poll();
  CommManager::instance().processBufferedLines();
  SafetyManager::instance().runChecks();
  CommManager::instance().handleBatchExecution();
  CalibrationManager::instance().update();

  // Auto-save positions on motion→idle edge
  static bool wasMoving = false;
  bool nowMoving = !StepperManager::instance().isIdle();
  if (wasMoving && !nowMoving) {
    float pos[CONFIG_JOINT_COUNT];
    for (size_t j = 0; j < CONFIG_JOINT_COUNT; ++j)
      pos[j] = JointManager::instance().getPosition(j);
    ConfigManager::instance().saveJointPositions(pos, CONFIG_JOINT_COUNT);
  }
  wasMoving = nowMoving;

  ConfigManager::instance().update();
  IOManager::instance().update();
}
```

### Notes

* No blocking calls; homing & batch are purely state‑driven.
* Batch timing is enforced in firmware (`handleBatchExecution`) using `dt/Subdiv`.

---

## File Map

| File (.\* = .h & .cpp) | Purpose                                               |
| ---------------------- | ----------------------------------------------------- |
| `main.cpp`             | Boot and loop orchestration                           |
| `CommManager.*`        | UART JSON, command handlers, batch loading/execution  |
| `JointManager.*`       | Deg‑space API, soft limits, velocity slices, cache    |
| `StepperManager.*`     | 100 kHz ISR step pulse engine (position + jog)        |
| `CalibrationManager.*` | 4‑phase homing with 7° backoff and offset zeroing     |
| `SafetyManager.*`      | E‑stop, LED policy, motion kill & reset gate          |
| `IOManager.*`          | Debounced inputs (buttons/limits/E‑stop), relays      |
| `ConfigManager.*`      | EEPROM JSON config + joint position persistence       |
| `HelperManager.*`      | Save positions & soft reset                           |
| `Config.*`             | Per‑joint defaults (speeds, limits, offsets, factors) |
| `PinDef.*`             | All pin maps and counts                               |

---

## “What changed & why it’s better”

* **Velocity streaming (batch)**: deterministic, smooth acceleration via **50 sub‑steps/segment**, zero‑jitter ISR updates, and graceful ramp to zero → fixes the “no targets” linear profile problem without AccelStepper’s per‑move accel/decel.
* **Homing**: **7°** backoff with explicit **switch‑clear confirmation** before slow re‑approach; final offset ignores limits and re‑zeros at true home → reliable, repeatable home.
* **EEPROM write coalescing**: prevents churn; positions are saved only on **motion→idle** edges.
* **Single source of truth for limits/factors**: `ConfigManager` keys hydrate **JointManager** cache → soft‑limits and scaling are consistent across moves and streaming.
* **Safety**: ISR‑level stop via StepperManager; E‑stop latched with clear re‑arm condition.
