# Pi Bridge Overview

## What is the Pi Bridge?

The **2-Pi-Bridge** is the central logic hub that connects the high-level robot control stack:

* **Python Inverse Kinematics Service** for motion planning and trajectory generation.
* **Serial Communication with Teensy** for executing joint movements, various commands and receiving status updates.
* **WebSocket + HTTP Server** using **Express + Socket.IO** to serve the frontend and expose APIs.
* **Acts as a Bridge between frontend ↔ Backend ↔ Microcontroller** in real-time.

---

## Components

### 1. `index.js` — Node.js Web Server & Serial Manager

| Function                        | Description                                                                    |
| ------------------------------- | -------------------------------------------------------------------------------|
| `express()`                     | Hosts the React static build (`/public`)                                       |
| `Socket.IO`                     | Bi-directional real-time WebSocket server (`io.on('connection')`)              |
| `SerialPort` + `ReadlineParser` | Communicates with the Teensy via `/dev/ttyAMA0` (115200 baud)                  |
| `spawn()`                       | Launches the Python IK engine (`ik_service.py`) with unbuffered I/O            |
| `requestIk()`                   | Queues requests to the IK service (only one at a time via FIFO `pending[]`)    |
| `writeTeensy()`                 | Sends JSON commands to the Teensy with ID tracking and timeout                 |
| `enqueueBatch()`                | Streams batched `MoveMultiple` commands to Teensy at a fixed interval (to fix) |

---

### 2. `ik_service.py` — Python Motion Engine

| Feature               | Description                                                                    |
| --------------------- | ------------------------------------------------------------------------------ |
| Robot Model           | Loads your URDF via Peter Corke's `ERobot` from `Robotics Toolbox for Python`  |
| Forward Kinematics    | Computes TCP pose from given joint angles using `compute_fk()`                 |
| Inverse Kinematics    | Solves joint angles from target TCP pose using `compute_ik()`                  |
| Linear Move Profiling | Trapezoidal velocity profile with clamped speed/accel per joint                |
| Streaming Moves       | Sends real-time `linearMove` steps to Teensy one by one                        |
| Batched Moves         | Sends entire trajectory to Node.js for batching                                |
| Profile Only Mode     | Returns a preview of the planned trajectory without executing                  |
| Command Parsing       | Reads newline-delimited JSON commands from stdin and returns structured output |

---

## Data Flow

```bash
    [ React UI ]
        ▲   ▲
        │   │ Socket.IO (ik_request, linearMove, etc.)
        ▼   ▼
  [ Node.js Server ]  ◀──── Python stdout/stderr ────▶  [ IK Service (ik_service.py) ]
        │   ▲
        │   │ Serial (Teensy JSON command/response)
        ▼   ▼
    [ Teensy 4.1 ]
```

---

## Socket.IO Events (Frontend ↔ Node)

| Event                                                | Direction                | Description                  |
| ---------------------------------------------------- | ------------------------ | ---------------------------- |
| `ik_request`                                         | → Node                   | FK/IK query                  |
| `fk_request`                                         | → Node                   | TCP from joint angles        |
| `linearMove`                                         | → Node → Python          | Streamed trajectory          |
| `linearMoveToTeensy`                                 | → Node → Python → Teensy | Batched movement             |
| `profileLinear`                                      | → Node → Python          | Dry-run trajectory preview   |
| `cmd`                                                | → Teensy                 | Raw passthrough JSON command |
| `jointStatus`, `parameters`                          | ← Node ← Teensy          | Real-time status feedback    |
| `linearMove_error`, `linearMoveComplete`             | ← from Python            | Streaming move events        |
| `profileLinear_response`                             | ← Node ← Python          | Profile data                 |
| `ik_response`, `fk_response`, `ik_error`, `fk_error` | ← Responses to IK/FK     |                              |

---

## JSON Protocols

### Teensy Commands

```json
{ "cmd": "MoveMultiple", "joints": [1,2,3], "targets": [...], "speeds": [...], "accels": [...] }
{ "cmd": "Home", "joint": 2, "speedFast": 50, "speedSlow": 3 }
{ "cmd": "StopAll" }
{ "cmd": "ListParameters" }
```

### Python IK Requests

```json
{ "position": [x,y,z], "quaternion": [x,y,z,w], "seed": [deg...], "speed": 0.02 }
{ "angles": [deg...] } → FK
{ "profileLinear": { ... } }
{ "linearMove": { ... } }
{ "linearMoveToTeensy": { ... } }
```

---

## Configuration and Parameters

* Python reads the robot URDF from:
  `6AR-000-000.SLDASM/urdf/6AR-000-000.SLDASM.urdf`
* Tool TCP offset: `Z +195 mm` relative to flange.
* Python default values:

  * `CONTROL_DT`: 0.02s
  * `V_TCP`: 0.02 m/s
  * `ANG_SPEED`: 45°/s
* Teensy serial is `/dev/ttyAMA0 @ 115200`
* Python interpreter is resolved from `venv/bin/python` in local folder.

---

## State Management

* `last_q`: Global variable in Python tracking the last solved joint angles.
* `latestTeensyJoints`: Stores last-reported positions from Teensy.
* `awaiting`: Tracks all pending writeTeensy commands by ID (cleared on ACK or timeout).
* `pending`: FIFO queue for IK service requests (only one active at a time).
* `batchQueue`: Stores queued `MoveMultiple` commands for scheduled dispatch to Teensy.

---

## Error Handling

| Failure                       | Behavior                                          |
| ----------------------------- | ------------------------------------------------- |
| Teensy ACK Timeout            | `StopAll` is sent, `teensy_timeout` event emitted |
| IK solve fails mid-trajectory | Error is emitted, motion aborts                   |
| IK fails pre-check            | `ik_error` sent back to UI                        |
| Malformed JSON from Teensy    | Logs to console, ignored                          |
| Python returns error          | Emitted as `linearMove_error` or `ik_error`       |

---

## Debugging Tips

* Use `console.log()` in `index.js` to trace the flow of messages.
* All IK stderr logs go to `[IKService:stderr]`, including tracebacks.
* Teensy stdout is printed line-by-line from the serial port.
* Teensy invalid JSON will show as `[Teensy] Invalid JSON`.

---

## Summary of Capabilities

| Category            | Description                                            |
| ------------------- | ------------------------------------------------------ |
|  Motion Planning    | Trapezoidal profiling, batch or streaming mode         |
|  Pose Solving       | IK & FK, with seeded and batched support               |
|  Command Queueing   | Smooth real-time dispatch of multi-axis commands       |
|  Full Roundtrip     | Real-time data and motion feedback from robot          |
|  WebSocket API      | Integrates with React frontend via Socket.IO           |
|  Safety             | Timeout handling, IK failure detection, emergency stop |

---
