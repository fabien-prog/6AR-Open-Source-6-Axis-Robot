# 5-Developer-Notes.md

## Project Vision

This project aims to build an open-source, cleanly architected 6-axis robotic system with:

* Real-time motion via Teensy 4.1
* High-level planning on a Raspberry Pi
* React-based UI for operator control
* Seamless FK/IK, smooth trajectories, safe execution

> **Goal**: Maintain clarity, modularity, and extensibility across all 3 layers (firmware, backend, UI).

---

## Project Structure

```bash
6AR-Open-Source-6-Axis-Robot/
├── 1-firmware/           # 🟦 Teensy firmware (Arduino C++)
│   └── src/
│       ├── CommManager.cpp  # Serial2 JSON interface
│       ├── JointManager.cpp # Stepper state & motion control
│       ├── CalibrationManager.cpp # Homing logic
│       └── ... (IO, Safety, Config)
│
├── 2-pi-bridge/          # 🟨 Pi backend (Node.js + Python)
│   ├── server.js         # Socket.IO + Serial + Python child process
│   ├── ik_service.py     # IK, FK, trajectory solver (Robotics Toolbox)
│   └── venv/             # Python virtual environment
│
├── 3-frontend/           # 🟩 React + Chakra UI SPA
│   ├── components/       # Tabs, viewers, modals
│   ├── socket.js         # Socket.IO interface
│   ├── DataContext.js    # Global system state
│   └── App.jsx           # Main layout
```

---

## Integration Philosophy

* All inter-process and inter-device communication must be **structured, JSON-based**, and logged.
* Each layer should **abstract away complexity** from the next:

  * Teensy doesn’t know about IK
  * Node doesn’t care about pinouts
  * React doesn’t worry about motion batching
* Code should fail **gracefully** with clear logs, not silently or destructively.

---

## Code Style & Structure

### Teensy (C++)

* ✅ All motion must be **non-blocking**
* ✅ Use `CAL_FAST_FORWARD`, `LOOKAHEAD_STEPS`, etc. consistently
* ✅ Wrap all shared functionality in Singleton-style Managers
* ✅ Homing sequence = fast → backoff → slow → offset

```cpp
// Good practice: clear, safe, non-blocking
if (!isHomed[joint]) return;
if (!stepper[joint].distanceToGo()) return;
```

### Python (IK)

* ✅ Global variable `last_q` tracks robot’s real-time joint state
* ✅ IK must validate against previous `last_q` to reduce jumps
* ✅ All trajectories should output:

  ```json
  {
    "initial": [...],
    "final": [...],
    "dt": 0.02,
    "speeds": [...],
    "accels": [...]
  }
  ```

* ✅ Prefer `@dataclass`-style clean structures if extended

### Node.js

* ✅ All commands go through `writeTeensy()`, ID-tracked
* ✅ Socket.IO → queue → teensy should be observable and debuggable
* ✅ Maintain a single `pending[]` and `batchQueue[]` state store
* ✅ When in doubt, log everything:

  ```js
  console.log('[Teensy] CMD sent:', cmd);
  ```

### React (Frontend)

* ✅ All shared state flows through `DataContext.js`
* ✅ Use `useEffect` for socket subscriptions (clean up on unmount)
* ✅ Keep each tab/component isolated and atomic
* ✅ Every action button should show feedback (toast or loading state)

---

## General Dev Rules

| Rule                        | Description                                        |
| --------------------------- | -------------------------------------------------- |
| 🔁 **No blocking loops**    | Teensy must stay responsive at all times           |
| 🔥 **No hardcoded paths**   | Use `path.join()` or platform-agnostic config      |
| 🧪 **Test edge cases**      | IK singularities, estop during move, power loss    |
| 📤 **Always respond**       | Every command to Teensy must emit a reply          |
| 💬 **Logs are required**    | All layers must clearly log events and errors      |
| 📐 **Comment complex math** | Python trajectory logic must be annotated          |
| 📄 **Document JSON shape**  | Any new command or event must include example JSON |
| 🧯 **Safety is priority**   | No motion unless homed, estop respected everywhere |

---

## Contribution Checklist

Before submitting or merging changes:

* [ ] New code is clearly commented
* [ ] No blocking code added in Teensy main loop
* [ ] Python prints clear logs for new commands
* [ ] JSON keys are camelCase and consistently structured
* [ ] React components use Chakra + match tab layout
* [ ] Socket.IO events are subscribed/cleaned up correctly
* [ ] Code tested end-to-end with real hardware (or mocked)

---

## Naming Conventions

| Scope      | Convention            | Example               |
| ---------- | --------------------- | --------------------- |
| C++ Consts | `ALL_CAPS_UNDERSCORE` | `JOG_STEP_US`         |
| C++ Vars   | `camelCase`           | `homeSpeedSlow`       |
| Python     | `snake_case`          | `compute_ik()`        |
| JS Vars    | `camelCase`           | `batchQueue`          |
| JSON Keys  | `camelCase`           | `cmd`, `speeds`, `id` |
| React      | `PascalCase`          | `JogTab`, `SystemTab` |

---

## Tooling & Dependencies

* Teensy 4.1 + Arduino or PlatformIO
* Python 3.9+ + `roboticstoolbox`, `spatialmath`, `numpy`
* Node.js (18.x or LTS)
* React + Chakra UI
* Three.js via `@react-three/fiber` and `@react-three/drei`

---

## Future Improvements

* [ ] Program editor in UI with syntax highlighting
* [ ] Teensy streaming encoder support (position feedback)
* [ ] Automatic calibration report after homing
* [ ] Full backup + restore of robot configuration
* [ ] Hardware simulator mode (virtual Teensy)

---
