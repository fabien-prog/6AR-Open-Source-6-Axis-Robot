# Glossary.md – 6AR Robot System

This glossary defines **all major technical terms, variable names, file names, and protocols** used across the 6AR robot project to ensure clarity for developers and contributors.

---

## Core Robotics Concepts

| Term                    | Definition                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| **6DOF**                | 6 Degrees of Freedom – robot has 6 independently controlled joints (rotational), enabling full pose control. |
| **TCP**                 | Tool Center Point – the "tip" of the robot (e.g., gripper), used as the reference for Cartesian movements.   |
| **Flange**              | The final frame of the robot arm, to which tools are mounted.                                                |
| **IK**                  | Inverse Kinematics – determines joint angles needed to achieve a desired pose (position + orientation).      |
| **FK**                  | Forward Kinematics – determines the pose of the TCP given a set of joint angles.                             |
| **URDF**                | Unified Robot Description Format – XML-based robot model defining links, joints, and inertial properties.    |
| **Trajectory**          | A time-based series of positions, velocities, and accelerations the robot should follow.                     |
| **Joint Space**         | Robot movement described in terms of joint angles.                                                           |
| **Cartesian Space**     | Movement described in 3D coordinates and orientations.                                                       |
| **Spherical Wrist**     | A robot configuration where the last 3 joints intersect, allowing decoupled position and orientation IK.     |
| **Singularity**         | A robot configuration where one or more degrees of freedom become uncontrollable or unstable.                |
| **Trapezoidal Profile** | A motion profile with acceleration, constant speed, and deceleration phases.                                 |

---

## Teensy Firmware (1-firmware/)

### Teensy Files

| File                      | Description                                                                      |
| ------------------------- | -------------------------------------------------------------------------------- |
| `CommManager.cpp`         | Handles serial parsing, JSON decoding, command dispatching, and acknowledgments. |
| `JointManager.cpp`        | Core stepper control (position, velocity, acceleration, jogging).                |
| `CalibrationManager.cpp`  | Homing logic per joint, including debounce, limit switch handling.               |
| `IOManager.cpp`           | Manages digital input/output pins and their debounce states.                     |
| `SafetyManager.cpp`       | Monitors estop state, soft limits, and halts motion as needed.                   |
| `Config.cpp` / `Config.h` | Configuration for max speed/accel, motion defaults, and safety settings.         |
| `PinDef.h`                | Maps joint pins, endstops, IO to pin numbers.                                    |

### Classes & Concepts

| Term                            | Description                                                                                    |
| ------------------------------- | ---------------------------------------------------------------------------------------------- |
| `MoveTo`                        | Command to move a single joint to a position with speed/acceleration.                          |
| `MoveMultiple`                  | Command to move multiple joints simultaneously (direct or batch).                              |
| `BeginBatch` / `M` / `EndBatch` | Batch motion execution commands – preloaded trajectory segments.                               |
| `Jog` / `StopJog`               | Real-time incremental movement for manual control; uses `target` (deg/s) and `accel` (deg/s²). |
| `Home`                          | Command to perform full homing sequence: fast → backoff → slow → offset.                       |
| `isHomed[]`                     | Per-joint array tracking whether a joint has completed homing.                                 |
| `currentPosition[]`             | Step position in degrees.                                                                      |
| `limitMin[]`, `limitMax[]`      | Joint software-enforced travel limits post-homing.                                             |
| `CAL_FAST_FORWARD`              | Homing fast approach speed constant.                                                           |
| `LOOKAHEAD_STEPS`               | Max number of steps that can be buffered in the queue.                                         |
| `MOVE_BATCH_INTERVAL_MS`        | Delay between sequential `MoveMultiple` packets in batch mode.                                 |
| `stepPulse()`                   | Function generating step pulses during motion.                                                 |

---

## Pi Bridge Server (2-pi-bridge/)

### Key Files

| File                     | Description                                                                 |
| ------------------------ | --------------------------------------------------------------------------- |
| `index.js` / `server.js` | Main backend: relays data between frontend, Python IK, and Teensy.          |
| `socketHandlers.js`      | Organized Socket.IO event handlers.                                         |
| `ik_service.py`          | Python-based IK solver and linear motion profile generator.                 |
| `requirements.txt`       | Python packages (numpy, scipy, spatialmath-python, roboticstoolbox-python). |
| `venv/`                  | Python virtual environment containing dependencies.                         |

### Communication

| Interface          | Description                                                 |
| ------------------ | ----------------------------------------------------------- |
| `Serial2` (Teensy) | UART interface to Teensy @ `921600` baud (ASCII JSON).      |
| `stdin/stdout`     | Communication with `ik_service.py` via child process pipes. |
| `Socket.IO`        | Bidirectional channel to the React frontend.                |

### Variables & Concepts

| Term              | Description                                                               |
| ----------------- | ------------------------------------------------------------------------- |
| `writeTeensy()`   | Sends a JSON command to Teensy with an `id` and waits for ACK.            |
| `batchQueue[]`    | Queue of pending `MoveMultiple` commands for batch execution.             |
| `pending[]`       | Tracks sent commands awaiting response from Teensy.                       |
| `CONTROL_DT`      | Time interval (`dt`) between trajectory points, e.g., 0.02 sec.           |
| `V_TCP`           | Desired linear speed of TCP in m/s.                                       |
| `ANG_SPEED`       | Desired rotational speed in deg/s for tool orientation transitions.       |
| `last_q`          | Joint angles of the last valid IK solution – used for seeding future IK.  |
| `max_ik_jump_deg` | Clamp for how much a joint can jump between segments (to prevent spikes). |
| `ctraj()`         | Cartesian interpolator from start pose to end pose (via SE3).             |
| `SE3`             | Special Euclidean Transform – position + orientation in 3D.               |
| `Slerp`           | Spherical linear interpolation for rotation blending (quaternions).       |

---

## Frontend (3-frontend/)

### Frontend Files

| File              | Description                                                    |
| ----------------- | -------------------------------------------------------------- |
| `App.js`         | Root component and layout wrapper.                             |
| `DataContext.js`  | React context managing global state (joint status, IO, estop). |
| `socket.js`       | Handles all incoming/outgoing `Socket.IO` events.              |
| `RobotLoader.js` | 3D viewer using `Three.js` and `@react-three/fiber`.           |
| `JogTab.js`      | UI for per-joint jogging controls.                             |
| `MoveAxisTab.js` | Multi-joint motion controls (via IK or manual setpoints).      |
| `SystemTab.js`   | Estop, restart, system status panel.                           |
| `ProgramTab.js`  | Block/structured program editor & runner.                      |
| `RunLogsView.js` | Live logs, playback preview, and syntax viewer.                |
| `BlockEditor.js` | Drag/drop block programming editor with inline math editing.   |

### UI Concepts

| Term                 | Description                                                             |
| -------------------- | ----------------------------------------------------------------------- |
| `jointStatusAll`     | Event returning live data for all joints: angle, velocity, target.      |
| `digitalInputs[]`    | Array of input channels, each with `enabled`, `status`, `friendlyName`. |
| `digitalOutputs[]`   | Toggleable outputs in the system UI.                                    |
| `linearMove`         | Streaming Cartesian move – processed one IK segment at a time.          |
| `linearMoveToTeensy` | Batched Cartesian move – pre-computed full joint-space motion.          |
| `profileLinear`      | Backend-only preview of batched motion for simulation.                  |
| `programCommands[]`  | Structured steps sent as `.6ar` programs for automation.                |
| `toast()`            | Chakra UI method for showing feedback alerts to users.                  |
| `@react-three/drei`  | Helpers for 3D rendering (lights, controls, grids).                     |

---

## Safety & Diagnostics

| Term                    | Description                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| `estop`                 | Emergency stop – disables all motion. Can be triggered by UI, limit switches, or serial fault. |
| `StopAll`               | Command sent by backend when queue overruns, estop is hit, or connection is lost.              |
| `isHomed[]`             | Each joint must be homed before any motion is accepted.                                        |
| `limitMin` / `limitMax` | Software-defined limits enforced after homing.                                                 |
| `debounceMillis`        | Time filter applied to input transitions to avoid false triggers.                              |
| `BatchExecStart`        | Event indicating Teensy began executing a preloaded batch.                                     |
| `SegmentLoaded`         | Event confirming a batch segment was accepted.                                                 |
| `BatchComplete`         | Event when a batch finishes successfully.                                                      |
| `BatchAborted`          | Event when a batch is stopped mid-execution.                                                   |
| `status: "ok"`          | JSON response status confirming success.                                                       |
| `status: "error"`       | JSON error from Teensy, backend, or solver (includes description).                             |

---

## Protocols & JSON Structures

| Structure               | Example                                                                                                           |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `MoveTo` Command        | `{ "cmd": "MoveTo", "joint": 4, "target": 90, "speed": 50, "accel": 10 }`                                         |
| `MoveMultiple` Command  | `{ "cmd": "MoveMultiple", "joints": [1,2], "targets": [...], "speeds": [...], "accels": [...] }`                  |
| `BeginBatch` + Segments | `{ "cmd": "BeginBatch" }` → `{ "cmd": "M", "joints": [...], "targets": [...], "speeds": [...], "accels": [...] }` |
| `Home` Command          | `{ "cmd": "Home", "joint": 6, "speedFast": 50, "speedSlow": 3 }`                                                  |
| `Jog` Command           | `{ "cmd": "Jog", "joint": 2, "target": 15, "accel": 20 }`                                                         |
| `IK Result`             | `{ "initial": [...], "final": [...], "dt": 0.02, "speeds": [...], "accels": [...] }`                              |
| `jointStatusAll` Event  | `{ "cmd": "jointStatusAll", "data": [{ "joint": 1, "position": ..., "velocity": ..., "target": ... }] }`          |

---
