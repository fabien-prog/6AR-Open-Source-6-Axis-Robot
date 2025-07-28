# React Frontend Overview

## Architecture

```bash
[User]
  ⇅
[React UI]
  ⇅  (via Socket.IO)
[Node.js Pi Bridge Server]
  ⇅
[Python IK Service]   [Teensy Firmware]
```

---

## Technologies Used

* **React** (functional components, hooks)
* **Chakra UI** (themeable component library)
* **Socket.IO** (real-time comms with backend)
* **Three.js / drei** (for 3D robot visualization)
* **Context API** (global state: system status, IO, joints)

## Socket Communication

All robot actions and telemetry flow through `socket.js`. Key events include:

### Outgoing (`emit`)

* `cmd`: sends raw JSON to Teensy (e.g., `{ cmd: "Home", joint: 2 }`)
* `ik_request`, `fk_request`: queries to Python
* `linearMove`, `linearMoveToTeensy`: stream or batch motion

### Incoming (`on`)

* `jointStatusAll`: joint state updates (position, velocity, target)
* `linearMove_error`, `profileLinear_error`, etc.
* `ik_response`, `fk_response`
* `systemStatus`, `homed`, `inputStatus`, etc.

---

## Main Features

### Homing

* UI triggers per-joint homing via `Home` command
* Displays current min/max limits when complete

### Jogging

* Per-joint jog buttons (±) with speed sliders
* `Jog` and `StopJog` commands issued in real time

### Joint Move

* Axis-by-axis or full multi-joint movements
* Uses Python-generated trapezoidal motion profile
* **Currently only works in simulation**

### IK-based Cartesian Move

* Accepts XYZ + quaternion target
* Streams or batches `MoveMultiple` joint commands over time

### Program Execution

* Load and run `.6ar` files with structured motion steps
* Logs each step, estimated durations, and errors

### IO Monitoring

* Rquest, view and toggle output states
* Request and view input states

### System Monitoring

* Uptime, estop status, current cycle count
* Digital inputs and outputs

---

## UI Design Goals

* **Single-page layout** with all key actions in one view
* **Status bar** showing estop, uptime, and connection state
* **Responsive layout** with tabs, modals, and tooltips
* **Live robot viewer** on side (Three.js + joint angles)
* **Batch + stream support** for trajectory execution

---

## Modularity

Each UI tab is self-contained:

* Independent `useEffect` hooks for updates
* Hooks into `DataContext` for shared state
* Uses Chakra’s grid, button, stat, and modal components

---

## Future Additions

* Live TCP position readback overlay
* Program editor with syntax highlighting
* Program execution with logging and live feedback
* IO diagnostic mode with pulse test
* Real-time error overlays + debug console

---
