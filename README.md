# Teensy 6-Axis Robot Arm

An open-source 6-axis robotic arm with real-time motion control, powered by a Teensy 4.1 and bridged via Raspberry Pi to a React frontend and Python-based kinematics. Modular, extensible, and designed for high-performance applications in research, automation, or education.

---

## 🔩 System Overview

* **Teensy Firmware**: C++ firmware managing stepper-driven motion, homing, jogging, and soft limits via Serial2 JSON API.
* **Raspberry Pi Bridge**: Node.js server mediating between Teensy and a Python kinematics backend, exposing a WebSocket (Socket.IO) API.
* **React Frontend**: Modern interface for controlling motion, IO, viewing logs, and editing programs. Features 3D URDF visualization with Three.js.

---

## 📁 Repository Structure

```
firmware/            # Teensy 4.1 embedded code
 ├─ Config.h/.cpp
 ├─ CalibrationManager.cpp
 ├─ CommManager.cpp
 ├─ IOManager.cpp
 ├─ SafetyManager.cpp
 └─ main.cpp

pi-bridge/           # Raspberry Pi Node.js + Python server
 ├─ server.js        # Socket.IO + serial bridge
 ├─ ik_service.py    # Python IK/FK service (Peter Corke / ikpy)
 └─ venv/            # Python virtualenv with dependencies

frontend/            # React UI client
 ├─ App.js
 ├─ DataContext.js
 ├─ tabs/            # UI pages (RunTab, MoveAxisTab, etc.)
 └─ components/      # Shared widgets & editors
```

---

## 🔌 Firmware Serial API (Teensy)

* Baud Rate: **38400** over **Serial2**
* Command Format: newline-delimited JSON (`{"cmd":"Home"}\n`)

Supported commands:

* `GetInputs`, `GetOutputs`, `GetSystemStatus`, `GetJointStatus`
* `MoveTo`, `MoveBy`, `MoveMultiple`
* `Jog`, `Stop`, `StopAll`
* `Home`, `AbortHoming`, `IsHoming`
* `SetParam`, `GetParam`, `ListParameters`
* `SetSoftLimits`, `SetMaxSpeed`, etc.
* `Output` (for digital outputs)

Refer to `firmware/docs/SerialAPI.md` for the full list.

---

## 📡 Pi Bridge (Node.js + Python)

### 🔧 Architecture

* **Node.js Server**

  * Opens serial port to Teensy (`/dev/ttyAMA0` @ 38400 baud)
  * Spawns `ik_service.py` as subprocess
  * Handles bidirectional JSON messages
  * Exposes **Socket.IO** interface to frontend

* **Python Kinematics**

  * Loads URDF via `ikpy.Chain`
  * Responds to IK/FK requests on stdin/stdout
  * Uses Peter Corke’s Robotics Toolbox (future-ready)

### 🔁 Socket.IO Events

* `ik_request`, `fk_request` → to Python
* `cmd` → forwarded to Teensy
* Broadcasts: `inputStatus`, `jointStatus`, `systemStatus`, etc.

---

## 🧠 Python IK Service (`ik_service.py`)

* **Input**: JSON via stdin

  * `{ "angles": [a1, a2, ..., a6] }` → FK
  * `{ "position": [...], "quaternion": [...] }` → IK

* **Output**: JSON via stdout

  * FK: `{ "position": [...], "orientation": [...], "timing_ms": {...} }`
  * IK: `{ "angles": [...], "timing_ms": {...} }`

* Uses scipy + ikpy

* Two-stage IK solver with fallback

---

## 💻 React Frontend (UI)

### 🔧 Architecture

* Chakra UI + Three.js (via @react-three/fiber)
* `DataContext.js`: centralized Socket.IO state + actions
* Tabs: Run, MoveAxis, IOControls, Logs, Settings, Program Editor
* URDF model viewer with real-time joint angle updates

### 🔌 Commands via `useData()`

```js
moveTo(joint, target, speed, accel)
moveBy(joint, delta, speed, accel)
jog(joint, speed)
stop(joint)
home(joint, speedFast, speedSlow)
output([id1, id2], [1, 0])
ikRequest([x,y,z], [qx,qy,qz,qw])
```

### 📥 Socket Events Received

* `inputStatus`, `jointStatus`, `systemStatus`, `outputStatus`
* `ik_response`, `fk_response`, `parameters`, `homed`, `log`

---

## 🧪 Getting Started

1. **Flash Firmware** to Teensy 4.1 via Arduino IDE or PlatformIO
2. **Run Pi Bridge**

   ```bash
   cd pi-bridge
   npm install
   node server.js
   ```
3. **Start UI**

   ```bash
   cd frontend
   npm install
   npm start
   ```
4. Open [http://localhost:3000](http://localhost:3000) in your browser

---

## 🛠 Roadmap

* [ ] Switch from IKPy to Peter Corke Robotics Toolbox
* [ ] Queue/trajectory execution
* [ ] Real-time ROS2 bridge
* [ ] REST API & WebUSB support
* [ ] Hardware encoder integration

---

## 📖 License

MIT License – free to use, modify, and contribute.

---

## 🤝 Contributing

We welcome PRs for everything from new UI panels to low-level firmware fixes. Please open an issue first for major features.

> Built with love for embedded robotics. 🦾
