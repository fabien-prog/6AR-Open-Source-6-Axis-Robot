# React Frontend Overview

## 📐 Architecture

```bash
[User]
  ⇅
[React UI + Electron Shell]
  ⇅  (via Socket.IO)
[Node.js Pi Bridge Server]
  ⇅
[Python IK Service]   [Teensy Firmware]
```

---

## 🛠 Technologies Used

* **React** (functional components, hooks)
* **Chakra UI** (themeable UI components)
* **Socket.IO** (real-time comms with backend)
* **Three.js / drei** (3D robot visualization)
* **Zustand** (joint state & UI state store)
* **React Context API** (`DataContext`) for shared system data
* **react-beautiful-dnd** (block programming drag-and-drop)
* **Electron** (packaged desktop app)

---

## 🔌 Socket Communication

All robot actions and telemetry flow through the shared Socket.IO instance in `DataContext`.

### **Outgoing (`emit`)**

* `cmd` — sends raw JSON to Teensy (e.g., `{ cmd: "Home", joint: 2, speedFast: 50, speedSlow: 3 }`)
* `ik_request`, `fk_request` — queries to Python IK service
* `linearMove`, `linearMoveToTeensy` — stream or batch Cartesian moves
* `profileLinear` — request a dry-run motion profile
* Program control events — from block/program runner to backend

### **Incoming (`on`)**

* `jointStatusAll` — per-joint position, velocity, accel, target
* `parameters` — full firmware parameter set
* `linearMove_error`, `linearMoveComplete`
* `profileLinear_response`, `profileLinear_error`
* `ik_response`, `ik_error`, `fk_response`, `fk_error`
* `systemStatus`, `homed`
* `inputStatus`, `outputStatus`
* Async Teensy events (`BatchExecStart`, `SegmentLoaded`, `BatchComplete`, `BatchAborted`)

---

## 🚀 Main Features

### **Homing**

* UI buttons for per-joint homing via `Home` command.
* Shows progress state and final limit offsets.
* Matches firmware’s fast → backoff → slow → offset sequence.

### **Jogging**

* Per-joint ± buttons with continuous hold.
* Jog velocity & accel sliders tied to firmware `Jog` API (`target` in deg/s, `accel` in deg/s²).
* `StopJog` issued immediately on release or switch hit.

### **Joint Move**

* Absolute or relative axis-by-axis moves.
* Multi-joint synchronous moves using trapezoidal sync profiles from Python.
* Honors joint limits from firmware.
* Works on both simulated and real robot.

### **IK-based Cartesian Move**

* Accepts XYZ + quaternion or Euler targets.
* Uses Python trapezoidal profiling for smooth motion.
* **Streaming mode** — direct step-by-step updates to Teensy.
* **Batched mode** — full profile sent to Teensy via `MoveMultiple`.

### **Program Execution**

* Load `.6ar` block-programming files.
* Supports `MoveJ`, loops, variables, math, waits, and logging.
* Program Runner sends moves via streaming or batch depending on block type.
* Execution log shows timestamps, parameters, and errors.

### **IO Monitoring**

* View and toggle digital outputs.
* View digital inputs in real time.
* Names and enable flags come from firmware config.

### **System Monitoring**

* E-stop state, uptime, connection health.
* Joint telemetry updated live at `CONTROL_DT` rate.
* Parameter list from firmware (`ListParameters`).

---

## 🎯 UI Design Goals

* **Single-page control panel** — 3D view, jog, home, moves, IO, and program control in one screen.
* **Modal-based settings** — all configuration changes in popups, non-blocking.
* **Real-time sync** — 3D viewer follows both simulated and real joint angles.
* **Responsive layout** — works on wide desktop and reduced-width Electron windows.
* **Status indicators** — E-stop, homed state, motion active, batch status.

---

## 🧩 Modularity

* **Tabs** — Actions, Move Axis, IO, Program Editor, Logs.
* **Self-contained hooks** — each tab subscribes only to needed events.
* **`useJointStore` (Zustand)** — decouples joint positions from UI re-renders.
* **Three.js RobotLoader** — imports URDF/STL, animates joints with lerp for smooth visual motion.
* **Block Editor** — draggable blocks with popovers, inline math editor, and syntax-preserving runner.

---

## 🔮 Future Additions

* Live TCP overlay in viewer.
* `MoveL` and `MoveC` in block editor.
* More firmware commands in program runner (`SetDO`, `WaitDI`, etc.).
* IO diagnostics (pulse output).
* Real-time error overlay & debug console.
* Toolpath preview in 3D for planned moves.

---

This updated version now matches:

* **Your recent firmware jog API changes** (`target` + `accel` instead of `speed`).
* **Program execution reality** (works on real robot, not just sim).
* **Extra socket events** from new firmware batch/async notifications.
* **Zustand integration** for joint state.
* **Block programming UI upgrades** (popovers, inline math editor, drag/drop).

---