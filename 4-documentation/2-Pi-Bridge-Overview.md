# 2-Pi-Bridge Overview

## 📌 Purpose

The **2-Pi-Bridge** is the **central coordination layer** between:

* **Frontend UI (React/Electron)** — user interface and program control.
* **Python IK Service** — inverse/forward kinematics, motion profiling, and trajectory generation.
* **Teensy 4.1 Firmware** — real-time joint control, IO handling, and safety enforcement.

It handles **real-time, bidirectional** communication between these systems, guaranteeing that motion commands, kinematic calculations, and robot status updates are correctly routed and synchronized.

---

## 🧩 Main Responsibilities

1. **Serve the Frontend** — via Express, serving static React build and WebSocket API.
2. **Handle WebSocket Events** — using Socket.IO for low-latency, bidirectional data exchange with the frontend.
3. **Launch & Manage Python IK Engine** — handling all FK/IK and trajectory planning requests in a controlled queue.
4. **Bridge to Teensy Firmware** — sending/receiving JSON commands and events over a dedicated serial connection.
5. **Command Tracking & Safety** — matching command IDs with ACKs, handling timeouts, and ensuring safe stops.

---

## ⚙️ Components

### **1. `index.js` — Node.js Server & Serial Manager**

| Function / Component            | Description                                                                      |
| ------------------------------- | -------------------------------------------------------------------------------- |
| **Express Server**              | Serves compiled frontend (`/public`).                                            |
| **Socket.IO Server**            | Maintains WebSocket connections (`io.on('connection')`).                         |
| **SerialPort + ReadlineParser** | Handles Teensy communication via `/dev/ttyAMA0` at **115200 baud** (8N1).        |
| **Python Process Spawn**        | Launches `ik_service.py` in unbuffered mode, capturing `stdout` and `stderr`.    |
| **`writeTeensy()`**             | Sends JSON commands to Teensy, includes `id` for ACK tracking, manages timeouts. |
| **`requestIk()`**               | Places IK/FK requests into FIFO queue to Python (only one in flight).            |
| **`enqueueBatch()`**            | Streams `MoveMultiple` packets to Teensy at fixed interval from `batchQueue`.    |
| **Error Handling**              | Detects Teensy timeouts, Python errors, malformed JSON, and triggers safe stops. |

---

### **2. `ik_service.py` — Python Motion Engine**

| Feature / Function       | Description                                                                      |
| ------------------------ | -------------------------------------------------------------------------------- |
| **Robot Model**          | Loads URDF via Peter Corke’s `ERobot` class.                                     |
| **FK Solver**            | Calculates TCP pose from joint angles (`compute_fk()`).                          |
| **IK Solver**            | Finds joint angles for given TCP pose (`compute_ik()`), supports seeded search.  |
| **Trajectory Profiling** | Generates trapezoidal velocity profiles with joint-wise clamping of speed/accel. |
| **Streaming Mode**       | Sends trajectory steps to Teensy one by one at fixed `CONTROL_DT`.               |
| **Batched Mode**         | Generates full trajectory and sends it to Node for timed serial dispatch.        |
| **Profile-Only Mode**    | Returns trajectory preview without moving the robot.                             |
| **Command Handling**     | Reads newline-delimited JSON from stdin, outputs structured JSON to stdout.      |

---

## 🔄 Data Flow

```text
[ React Frontend ]
      ▲   ▲
      │   │  Socket.IO: ik_request, linearMove, profileLinear, etc.
      ▼   ▼
[ Node.js Server ]  ◀── stdout/stderr ──▶  [ Python IK Service ]
      │   ▲
      │   │  Serial JSON @ 115200 baud
      ▼   ▼
[ Teensy 4.1 Firmware ]
```

---

## 📡 Socket.IO Event Map

| Event Name                    | Direction                | Description                                     |
| ----------------------------- | ------------------------ | ----------------------------------------------- |
| `ik_request`                  | → Node → Python          | IK from TCP pose to joint angles.               |
| `fk_request`                  | → Node → Python          | FK from joint angles to TCP pose.               |
| `linearMove`                  | → Node → Python          | Real-time streaming of linear Cartesian motion. |
| `linearMoveToTeensy`          | → Node → Python → Teensy | Batched Cartesian motion execution.             |
| `profileLinear`               | → Node → Python          | Returns trajectory preview data.                |
| `cmd`                         | → Node → Teensy          | Sends raw JSON command to firmware.             |
| `jointStatus` / `parameters`  | ← Node ← Teensy          | Continuous status and configuration feedback.   |
| `ik_response` / `fk_response` | ← Node ← Python          | FK/IK results back to frontend.                 |
| `linearMove_error`            | ← Node ← Python          | Motion aborted due to error.                    |
| `linearMoveComplete`          | ← Node ← Python          | Streaming motion finished.                      |
| `profileLinear_response`      | ← Node ← Python          | Trajectory preview data returned.               |

---

## 📝 JSON Protocols

### **Teensy Command Examples**

```json
{ "cmd": "MoveMultiple", "joints": [1,2,3], "targets": [..], "speeds": [..], "accels": [..], "id": 42 }
{ "cmd": "Home", "joint": 2, "speedFast": 50, "speedSlow": 3, "id": 43 }
{ "cmd": "StopAll", "id": 44 }
{ "cmd": "ListParameters", "id": 45 }
```

**Rules:**

* All motion/IO commands **must** have an `"id"` for ACK tracking.
* Responses from Teensy echo the same `"id"`.

---

### **Python IK Requests**

```json
{ "position": [x, y, z], "quaternion": [qx, qy, qz, qw], "seed": [deg...], "speed": 0.02 }
{ "angles": [deg...] }  // FK
{ "profileLinear": { "from": [...], "to": [...], "speed": 0.02 } }
{ "linearMove": { "from": [...], "to": [...], "speed": 0.02 } }
{ "linearMoveToTeensy": { "from": [...], "to": [...], "speed": 0.02 } }
```

---

## ⚙️ Configuration & Parameters

* **URDF Path:**
  `6AR-000-000.SLDASM/urdf/6AR-000-000.SLDASM.urdf`
* **TCP Offset:**
  +Z 195 mm from flange.
* **Python Defaults:**

  * `CONTROL_DT`: 0.02 s
  * `V_TCP`: 0.02 m/s
  * `ANG_SPEED`: 45 °/s
* **Serial Settings:**

  * Port: `/dev/ttyAMA0`
  * Baud: `115200`
  * Format: 8N1, newline-terminated JSON
* **Python Interpreter:**
  Resolved from local `venv/bin/python`.

---

## 📦 State Management

* **`last_q` (Python)** — last solved joint angles.
* **`latestTeensyJoints` (Node)** — last received joint states from firmware.
* **`awaiting` (Node)** — map of command IDs awaiting Teensy ACK.
* **`pending` (Node)** — FIFO queue for Python IK/FK requests.
* **`batchQueue` (Node)** — upcoming `MoveMultiple` packets for timed streaming.

---

## 🚨 Error Handling

| Failure Case               | Bridge Response                                |
| -------------------------- | ---------------------------------------------- |
| **Teensy ACK Timeout**     | Sends `StopAll`, emits `teensy_timeout`.       |
| **IK Solve Fails Mid-Run** | Aborts, emits `linearMove_error`.              |
| **IK Pre-Check Failure**   | Emits `ik_error`.                              |
| **Malformed Teensy JSON**  | Logs `[Teensy] Invalid JSON`, ignores packet.  |
| **Python Runtime Error**   | Logged to `[IKService:stderr]`, emitted to UI. |

---

## 🔍 Debugging Tips

* **Node Logs**:

  * `[Teensy:stdout]` — firmware responses.
  * `[IKService:stdout]` — Python computed results.
  * `[IKService:stderr]` — Python errors/traces.
* Teensy invalid JSON will produce an `[Invalid JSON]` log.
* Use `console.log()` in `server.js` to trace request/response flow.

---

## ✅ Summary of Capabilities

| Category             | Description                                                       |
| -------------------- | ----------------------------------------------------------------- |
| **Motion Planning**  | Trapezoidal profiling, streaming or batched trajectory execution. |
| **Pose Solving**     | Full FK/IK with seed and batch support.                           |
| **Command Queueing** | ID-tracked commands with timeout handling.                        |
| **Safety**           | Auto-stop on timeout, error, or E-stop.                           |
| **Roundtrip Data**   | Live status from Teensy back to frontend.                         |
| **WebSocket API**    | Real-time robot control via Socket.IO.                            |

---