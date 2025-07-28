# 6AR – Open-Source 6-Axis Robotic Arm

**6AR** is an diy, industrial-class and open-source **6-axis robot arm** designed from scratch for high performance, reliability, and modularity — without the industrial price tag.

Built around a **Teensy 4.1**, a **Raspberry Pi 5**, and a **React-based control interface**, 6AR offers a powerful platform for robotics education, research, automation, and fun!

> This project was born from a personal desire to **challenge myself**, to create something professional-grade using open tools — and hopefully inspire a growing community of builders, learners, and tinkerers who share that vision.

---

## 🎯 Vision & Motivation

My goal with this project was to build a robot arm that behaves **as closely as possible to a real industrial 6 axis manipulator**:

- Accurate and smooth motion
- Fully programmable and networked
- Real-time control
- Configurable and extensible
- Affordable (compared to commercial solutions)

I wanted to prove that with modern tools — 3D printing, CNC machining, a few well-chosen components, and smart software — anyone can build a capable, safe, and powerful robot arm.

I hope others will replicate, improve, and adapt this robot. A community around this could mean:

- 🧠 Collective development and new features
- 📦 New end-effectors, programs, or extensions
- 📚 Shared learning in robotics, controls, and UI/UX
- 🤝 Helping newcomers bring their robot ideas to life

---

## ⚙️ Capabilities

| Feature                          | Description                                                                 |
|----------------------------------|-----------------------------------------------------------------------------|
| Full Pose IK                     | Solve for Cartesian position **and** orientation with joint limits          |
| Linear TCP Pathing               | Trapezoidal velocity motion over multiple IK poses                          |
| Real-Time Stepper Control        | All axis updates happen on Teensy in real time                              |
| Web-Based Control Interface      | React frontend with jog, run, 3D viewer, IO, and drag-and-drop programming  |
| Python Kinematics Service        | Fast (<7ms) IK/FK using Peter Corke’s Robotics Toolbox                      |
| Drag-and-Drop Graphical Editor   | Build sequences with loops, conditions, motion, and delays                  |
| Pneumatic Gripper Control        | Via onboard compressor and solenoid valve                                   |
| Closed-Loop Control              | On all joints (stepper + servo), real-time position feedback coming soon    |

---

## 📦 Specs

| Parameter        | Value                    |
|------------------|--------------------------|
| Payload          | ~15 kg @ 1000 mm radius  |
| Reach            | 1000 mm                  |
| Robot weight     | ~60 kg                   |
| Control box      | ~25 kg                   |
| Total cost       | ~6000 CAD (materials)    |
| Dev time so far  | ~8 months full-time      |

### 🔩 Joint Details

| Joint | Drive Type                                              | Torque (Nm) | Max Speed (°/s) |
|-------|---------------------------------------------------------|-------------|-----------------|
| J1    | Belt + NEMA 34 closed-loop                              | 154         | 110             |
| J2    | ISV57T servo + planetary gearbox + belt + cycloidal     | 270         | 45              |
| J3    | ISV57T servo + planetary gearbox+ belt  + cycloidal     | 170         | 45              |
| J4    | NEMA 23 + cycloidal                                     | 84          | 250             |
| J5    | NEMA 23 + planetary gearbox                             | 24          | 240             |
| J6    | NEMA 23 + planetary gearbox                             | 12          | 720             |
| J7    | Linear rail (WIP)                                       | TBD         | TBD             |

---

## 🛠️ Architecture Overview

```bash
6AR-Open-Source-6-Axis-Robot/
├── firmware/        → C++ code for Teensy (stepper control, homing, comms)
├── pi-bridge/       → Node.js + Python server (IK, routing, serial)
├── frontend/        → React UI with live 3D URDF and programming interface
└── documentation/   → Full developer documentation (see below)
```

---

## 📂 Documentation

> All technical documentation lives in the [`documentation/`](./documentation) folder.

| File | Description |
|------|-------------|
| [`1-Teensy-Code-Overview.md`](./documentation/1-Teensy-Code-Overview.md) | Core architecture, managers, and motion control on the Teensy |
| [`1-Teensy-Serial-API.md`](./documentation/1-Teensy-Serial-API.md)       | Full reference for all JSON commands Teensy accepts (e.g. `moveTo`, `home`) |
| [`2-Pi-Bridge-Overview.md`](./documentation/2-Pi-Bridge-Overview.md)     | Explains Node.js/Python architecture and Socket.IO routes |
| [`3-Frontend-Overview.md`](./documentation/3-Frontend-Overview.md)       | Layout of React UI, `useData` hook, event flow, tabs, and state |
| [`4-Setup-Guide.md`](./documentation/4-Setup-Guide.md)                   | From wiring (TODO) to flashing to launching everything — step-by-step |
| [`5-Developer-Notes.md`](./documentation/5-Developer-Notes.md)           | Coding rules, naming conventions, structural decisions |
| [`6-Glossary.md`](./documentation/6-Glossary.md)                         | All acronyms and robotics terms used in this repo |

---

## 🌐 Tech Stack

- **Microcontroller**: [Teensy 4.1](https://www.pjrc.com/store/teensy41.html)
- **Host CPU**: Raspberry Pi 5
- **Frontend**: React.js + Chakra UI + Three.js
- **Backend**: Node.js + Python 3 (Robotics Toolbox)
- **Stepper drivers**: Step/Dir closed-loop (OMC, StepperOnline)
- **Servos**: ISV57T-180S (3500 RPM at 48V)
- **Pneumatics**: Onboard compressor + SMC MH2F-16D2 gripper

---

## 💬 Community & Development

This started as a solo project, but I’d love for it to grow:

- 🛠 Want to build your own version?
- 🧠 Interested in helping with firmware/UI/IK?
- 🎓 A teacher or student using this in class?
- 🤖 Want to add ROS2, simulation, or vision?

Let’s build something incredible together. Open issues, make pull requests, or email me if you want to collaborate.

---

## 📜 License

MIT — free to use, modify, and distribute.

---

## 📍 Next Milestones

- [x] Drag-and-drop programming UI (Functionnal Proof of Concept implemented)
- [x] Full pose IK + TCP motion profiler (Functionnal Proof of Concept implemented)
- [x] Pneumatic gripper integration (Fully Functionnal)
- [ ] Improve URDF mesh + joint limits (Simplify mesh for faster render)
- [ ] Add joint feedback from Teensy to UI (Add absolute encoders to each joints and PID loop to teensy)
- [ ] Make it easier to build: CAD cleanup + BOM + Assembly tips/videos

---

Built with joy, frustration, tens of thousands of lines of code, and a few cracked tables (Lol, I since put the robot on a steel plate. The inertia was too intense!).

**– Fabien (a.k.a. Stayin_alive_ah on reddit or 6AR-Robotics on Insta + Youtube)** 🦾

---
