# Developer Notes

## Project Shape

```text
6AR-Open-Source-6-Axis-Robot/
├── 1-firmware/       # Teensy 4.1 firmware, PlatformIO + Arduino C++
├── 2-pi-bridge/      # Node.js bridge + Python IK service
├── 3-frontend/       # React 19 + TypeScript + Vite UI
└── 4-documentation/  # project docs
```

## Firmware

Important files:

```text
1-firmware/src/
├── main.cpp
├── CommManager.cpp/.h
├── JointManager.cpp/.h
├── StepperManager.cpp/.h
├── CalibrationManager.cpp/.h
├── SafetyManager.cpp/.h
├── IOManager.cpp/.h
├── ConfigManager.cpp/.h
├── Config.cpp/.h
├── PinDef.cpp/.h
└── HelperManager.cpp/.h
```

Guidelines:

- keep the main loop non-blocking
- keep hard timing inside `StepperManager`
- use manager singletons consistently
- route serial commands through `CommManager`
- keep command responses JSON and preserve `id`
- keep motion safety checks close to motion entry points
- update `1-Teensy-Serial-API.md` when command shapes change

Firmware communication facts:

- Teensy UART: `Serial2`
- Pi-facing baud: `921600`
- JSON framing: one object per line
- batch upload: `BeginBatch`, `M`, `AbortBatch`
- streaming velocity: `SetVel`
- status: `GetJointStatus`, `GetSystemStatus`, `GetInputs`, `GetOutputs`, `ListParameters`

## Pi Bridge

Important files:

```text
2-pi-bridge/
├── server.js
├── UARTService.js
├── IKService.js
├── SocketService.js
├── ik_service.py
├── package.json
└── requirements.txt
```

Guidelines:

- keep all Teensy writes behind `writeTeensy()`
- commands sent to Teensy should receive an `id`
- preserve timeout handling and safe stops
- keep Python requests serialized through the IK queue
- do not dump full trajectories in logs
- use Socket.IO events that map clearly to UI workflows
- update bridge and frontend docs together when an event changes

Runtime facts:

- server listens on `0.0.0.0:5001`
- production frontend is served from `2-pi-bridge/public`
- Teensy port is `/dev/ttyAMA0`
- Teensy baud is `921600`
- Python interpreter path is `2-pi-bridge/venv/bin/python`

## Frontend

Important files:

```text
3-frontend/src/
├── main.tsx
├── App.tsx
├── contexts/
├── features/
├── hooks/useUpdateData.ts
├── lib/run6ar.ts
└── stores/JointStore.ts
```

Guidelines:

- keep socket lifecycle in `SocketContext`
- keep shared robot data in the robot providers
- keep repeated server data in TanStack Query
- use Zustand for viewer/joint state that changes frequently
- send firmware commands through the bridge `cmd` event
- clean up socket listeners in effects
- keep UI controls consistent with the existing Radix/shadcn-style components

Frontend facts:

- Vite dev command: `npm run dev`
- production build output: `3-frontend/dist`
- default bridge URL: `http://192.168.0.55:5001`
- configurable by `VITE_SOCKET_URL` or `localStorage["6ar.socketUrl"]`

## Naming

| Area | Convention | Example |
| --- | --- | --- |
| C++ constants | `ALL_CAPS_UNDERSCORE` | `CONFIG_JOINT_COUNT` |
| C++ variables/functions | `camelCase` | `homeSpeedSlow` |
| Python | `snake_case` | `compute_fk()` |
| TypeScript variables/functions | `camelCase` | `profileLinear` |
| React components | `PascalCase` | `RobotStudioTab` |
| JSON keys | `camelCase` where practical | `speedFast` |

## Before Merging

- firmware builds
- frontend builds with `npm run build`
- bridge starts with `node server.js`
- new command/event shapes are documented
- unsafe motion paths are tested with E-stop behavior
- socket listeners are subscribed/unsubscribed cleanly
- UI still works with simulated and real robot flows where applicable
