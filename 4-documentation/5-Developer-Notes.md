# 5-Developer-Notes.md

## Project Vision

This project aims to build an open-source, cleanly architected 6-axis robotic system with:

* **Real-time motion control** via Teensy 4.1 (stepper-driven joints)
* **High-level planning & IK** on a Raspberry Pi
* **React + Electron UI** for operator control
* **Seamless FK/IK, smooth trajectories, safe execution**
* **Unified JSON-based protocol** across firmware, backend, and UI

> **Goal**: Maintain clarity, modularity, and extensibility across all 3 layers (firmware, backend, UI) while ensuring deterministic, safe motion.

---

## Project Structure

```bash
6AR-Open-Source-6-Axis-Robot/
├── 1-firmware/           # 🟦 Teensy firmware (Arduino C++)
│   └── src/
│       ├── CommManager.cpp         # Serial2 JSON interface + ID ACK tracking
│       ├── JointManager.cpp        # Stepper state & motion control
│       ├── CalibrationManager.cpp  # Homing: fast → backoff → slow → offset
│       ├── SafetyManager.cpp       # E-stop, limits, fault handling
│       ├── IOManager.cpp           # Inputs, outputs, debounce
│       ├── Config.cpp / Config.h   # Joint limits, speeds, EEPROM
│       └── PinDef.h                # All pin mappings
│
├── 2-pi-bridge/          # 🟨 Pi backend (Node.js + Python)
│   ├── index.js          # Express + Socket.IO + Teensy serial manager
│   ├── socketHandlers.js # Organized Socket.IO event handlers
│   ├── ik_service.py     # IK/FK, trajectory solver (Robotics Toolbox)
│   ├── SERIAL_API.md     # Full Teensy JSON command reference
│   └── venv/             # Python virtual environment
│
├── 3-frontend/           # 🟩 React + Chakra UI + Electron
│   ├── components/       # Tabs, viewers, modals
│   ├── utils/store.js    # Zustand store for joint state/UI state
│   ├── DataContext.js    # Global system data, socket instance
│   ├── socket.js         # Socket.IO connection layer
│   └── App.jsx           # Main layout & routing
```

---

## Integration Philosophy

* All communication is **structured JSON** with **required IDs** for ACK tracking.
* Each layer **abstracts complexity** from the next:

  * Teensy doesn’t know about IK math.
  * Node doesn’t know pinouts or electrical specifics.
  * React doesn’t handle motion batching or timing.
* **No silent failures** — all errors are logged and surfaced to the operator.
* Motion **never runs unless homed** and safety checks pass.

---

## Code Style & Structure

### Teensy (C++)

* ✅ All motion is **non-blocking** (ISR step generation)
* ✅ Use constants/macros (`CAL_FAST_FORWARD`, `LOOKAHEAD_STEPS`) consistently
* ✅ Wrap shared functionality in Singleton Managers
* ✅ **Homing sequence** is always: fast approach → stop → zero → backoff → slow approach → stop → offset → zero
* ✅ `Jog` API uses `target` (deg/s) and `accel` (deg/s²) — immediate stop on release or switch hit
* ✅ **Batch execution**: Supports `BeginBatch`, `M` (move segments), `AbortBatch`

```cpp
// Safe pattern:
if (!isHomed[joint]) return;
if (!stepper[joint].distanceToGo()) return;
```

---

### Python (IK Service)

* ✅ `last_q` stores last known joint angles for seeded IK
* ✅ IK clamps to joint limits before returning
* ✅ Trajectories are trapezoidal velocity profiles with per-joint clamping
* ✅ Supports:

  * Streaming motion (`linearMove`)
  * Batched motion (`linearMoveToTeensy`)
  * Profile preview (`profileLinear`)
* ✅ Returns structured JSON:

```json
{
  "initial": [...],
  "final": [...],
  "dt": 0.02,
  "speeds": [...],
  "accels": [...]
}
```

---

### Node.js (Pi Bridge)

* ✅ All Teensy commands go through `writeTeensy()` (adds `id`, waits for ACK or timeout)
* ✅ `pending[]` — tracks active Teensy commands
* ✅ `batchQueue[]` — holds queued `MoveMultiple` segments for timed dispatch
* ✅ Socket.IO handlers are modular and log all inbound/outbound events
* ✅ **Serial baud**: `921600` (must match Teensy firmware)
* ✅ Handles both blocking responses (IK, FK) and async events (`jointStatusAll`, `BatchComplete`)

---

### React (Frontend)

* ✅ Shared state via `DataContext.js` + Zustand store
* ✅ All socket subscriptions cleaned up in `useEffect`
* ✅ Tabs are **self-contained**, only subscribing to what they need
* ✅ All user actions give feedback (toast, loader, disabled state)
* ✅ 3D viewer (`RobotLoader`) lerps joint angles for smooth animation
* ✅ Block programming UI:

  * Drag/drop with react-beautiful-dnd
  * Inline math editor
  * Popover parameter editing
* ✅ Program Runner supports `MoveJ`, loops, variables, logging; `MoveL` planned next

---

## General Dev Rules

| Rule                      | Description                                               |
| ------------------------- | --------------------------------------------------------- |
| 🔁 **No blocking loops**  | Keep Teensy responsive at all times                       |
| 🛡 **Safety first**       | No motion unless homed & E-stop clear                     |
| 🔥 **No hardcoded paths** | Use `path.join()` or platform-agnostic config             |
| 🧪 **Test edge cases**    | IK singularities, E-stop during motion, power loss        |
| 📤 **Always ACK**         | Every Teensy command must result in a reply               |
| 📜 **Log everything**     | Console logs for commands, errors, and events             |
| 📐 **Comment math**       | Python IK & profiling code must be documented             |
| 📄 **Document JSON**      | Every new command/event has an example in `SERIAL_API.md` |
| 🚫 **No magic numbers**   | Constants go in Config or header files                    |

---

## Contribution Checklist

Before merging changes:

* [ ] Code is commented and matches style
* [ ] Teensy loop remains non-blocking
* [ ] Python logs include command + parameters
* [ ] JSON keys are camelCase
* [ ] React components match UI layout and use Chakra
* [ ] Socket.IO events subscribed/unsubscribed correctly
* [ ] Tested end-to-end with real hardware or simulator

---

## Naming Conventions

| Scope      | Convention            | Example               |
| ---------- | --------------------- | --------------------- |
| C++ Consts | `ALL_CAPS_UNDERSCORE` | `CAL_FAST_FORWARD`    |
| C++ Vars   | `camelCase`           | `homeSpeedSlow`       |
| Python     | `snake_case`          | `compute_ik()`        |
| JS Vars    | `camelCase`           | `batchQueue`          |
| JSON Keys  | `camelCase`           | `cmd`, `speeds`, `id` |
| React      | `PascalCase`          | `JogTab`, `SystemTab` |

---

## Tooling & Dependencies

* Teensy 4.1 (Arduino or PlatformIO)
* Python 3.9+ (`roboticstoolbox`, `spatialmath`, `numpy`)
* Node.js (18.x or LTS)
* React + Chakra UI
* Three.js via `@react-three/fiber` and `@react-three/drei`
* Electron for desktop packaging
* `react-beautiful-dnd` for block editor

---

## Future Improvements

* [ ] `MoveL` and `MoveC` block support
* [ ] Teensy encoder streaming (closed-loop feedback)
* [ ] Auto-calibration report after homing
* [ ] Backup/restore robot configuration
* [ ] Virtual-robot simulation mode in frontend
* [ ] Live TCP overlay in 3D viewer

---