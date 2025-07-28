# Overview of the Teensy Low Level Code

## Managers Breakdown

### `CommManager`

**Role**: Handles structured JSON-based serial communication over `Serial2` (UART), interfacing with a Node.js server running on the Raspberry Pi 5.

**Responsibilities**:

- Continuously polls for incoming serial data.
- Parses newline-delimited JSON commands into `StaticJsonDocument`.
- Routes commands to appropriate internal handlers (`handleMoveTo`, `handleHome`, etc.).
- Manages an internal command queue to regulate motion sequencing.
- Sends structured JSON responses with optional `id` field echo for tracking.

**Command Processing Pipeline**:

1. **`poll()`**
   Reads serial input one character at a time, ending on `\n`.

2. **`processIncoming()`**
   Parses the line, and either:

   - Handles it immediately (for status/queries), or
   - Enqueues it for deferred execution if it's a motion or config change (on blocking behavior mostly).

3. **`processQueue()`**
   Executes queued commands when joints are idle or near target (lookahead logic for `MoveMultiple` to smooth movement).

4. **`dispatchCommand(JsonObject)`**
   Delegates to specific command handlers based on `cmd` field.

**Key Features**:

- **Command Queue**
  Holds up to 1500 commands (`COMMAND_QUEUE_MAX`), avoiding overflow via backpressure.

- **Motion Lookahead**
  Allows pipelining of `MoveMultiple` commands by waiting for joints to be within `LOOKAHEAD_STEPS`.

- **ID Echoing**
  If `id` is present in a command, it is echoed back in the response to allow request tracking. Id should be included in every commands to make sure the pi ack logic works like intended.

- **Structured Responses**
  All replies follow the format:

  ```json
  { "cmd": "moveTo", "status": "ok", "id": 4 }
  ```

- **Command Handlers**
  Supports rich command set including (Note: cmd field is case sensitive):

  - Motion: `Move`, `MoveTo`, `MoveBy`, `MoveMultiple`, `Jog`, `Stop`
  - Homing: `Home`, `AbortHoming`, `IsHoming`
  - Query: `GetInputs`, `GetOutputs`,`GetJointStatus`, `GetSystemStatus`, `ListParameters`
  - Configuration: `SetParam`, `GetParam`, `SetSoftLimits`, etc.
  - Output control: `Output`
  - System control: `Restart`

**Integration with Other Managers**:

- Calls `JointManager` for movement.
- Calls `CalibrationManager` for homing and future calibration.
- Retrieves robot states via `IOManager`, `SafetyManager`, and `ConfigManager`.
- Triggers full soft restart using `HelperManager`.

### `JointManager`

**Role**: Controls all 6 stepper motors using AccelStepper.

- Converts user-space degrees → physical → steps.
- Executes movements via `moveTo`, `jogJoint`, `runJoint`.
- Applies soft limits, speed and acceleration caps.
- Tracks current position, velocity, acceleration per joint.
- Supports persistent logging on Serial (Teensy USB port) for diagnostics, which is not active by default.

**Uses**:

- Per-joint calibration (from EEPROM or defaults).
- Home offset handling.
- Internal stepper objects: `steppers[j]`.

---

### `SafetyManager`

**Role**: Central safety system (E-stop, LED logic).

- E-stop input is debounced and interrupts attached.
- Controls `RED_LED`,`GREEN_LED`,`YELLOW_LED`, and reset logic.
- E-stop triggers immediate `stopAll()` and sends input status.
- E-stop must be cleared via green button press when unreleased to re-arm the system.

---

### `CalibrationManager`

**Role**: Performs homing on each joint.

- 4-phase process:

  1. Fast approach to endstop
  2. Back off at fast pace (to +5 degrees with accel/decel)
  3. Slow approach to endstop
  4. Final offset to homeOffset (to degrees from switch with accel/decel)

- Uses limit switches and per-joint configuration.
- Sends `homed` responses with effective min/max range.

---

### `IOManager`

**Role**: Manages digital I/O with software debouncing.

- 12 buttons, 1 E-stop, and 6 limit switches tracked.
- All inputs debounced in µs with stable state tracking.
- Controls 9 relay outputs (LEDs, solenoids, etc.).
- Provides `isDigitalActive()`, `isLimitActive()`, `setOutput()`.

---

### `ConfigManager`

**Role**: Stores all configuration and calibration data in EEPROM.

- JSON-based structure stored in first 4KB of EEPROM.
- Provides access to:

  - motion tuning (speed, accel)
  - calibration (positionFactor, homeOffset)
  - joint limits

- Stores/restores last joint positions on boot/reset (to be worked on).

---

### `HelperManager`

**Role**: Handles system soft-reset with position preservation.

- Saves joint positions to EEPROM.
- Executes ARM system reset via AIRCR register.

---

### `Config.h / Config.cpp`

**Role**: Defines all joint, input, and output hardware mappings and defaults.

- Per-joint config: gear ratios, speeds, limits, etc.
- Per-input config: debounce time, logic level.
- Per-output config: pin mapping and default state.
- All structured as C++ arrays for easy access.

---

## Communication Details

- **Port**: `Serial2` (pins 7/8)
- **Baud Rate**: `115200`
- **Protocol**: JSON per line (`\n`-terminated)
- **Commands**: `MoveTo`, `MoveMultiple`, `Home`, `Stop`, `GetJointStatus`, etc.
- **Responses**: `{ "cmd": "moveTo", "status": "ok" }`

---

## Boot Sequence

1. `ConfigManager.begin()` loads config from EEPROM.
2. `JointManager.resetPosition()` restores last saved joint positions.
3. All managers initialize hardware and I/O.
4. Serial interface announces `=== READY ===`.

---

## Key Runtime Loop (`loop()`)

```cpp
void loop() {
  CommManager::instance().poll();
  CommManager::instance().processIncoming();
  CommManager::instance().processQueue();
  JointManager::instance().updateSteppers();
  JointManager::instance().handleLogging();
  CalibrationManager::instance().update();
  IOManager::instance().update();
  SafetyManager::instance().runChecks();
}
```

- Ensures non-blocking stepping and responsive control.
- Keeps stepper motion, homing, safety, and I/O updated at high rate.
- Allows real-time streaming of joint commands from Pi via serial.

---

## File Map Summary

| File (.* = .h & .cpp)   | Purpose                                     |
| ----------------------- | ------------------------------------------- |
| `main.cpp`              | System setup and main loop                  |
| `CommManager.*`         | Serial communication + command handling     |
| `JointManager.*`        | Stepper motor control + motion API          |
| `CalibrationManager.*`  | Homing and limit switch logic               |
| `SafetyManager.*`       | Emergency stop and safety logic             |
| `IOManager.*`           | Inputs (buttons, limits) + outputs (relays) |
| `ConfigManager.*`       | Persistent JSON config                      |
| `HelperManager.*`       | Position-saving restart                     |
| `Config.*`              | Default joint + IO configuration            |
| `PinDef.*`              | Hardware pin mappings                       |

---
