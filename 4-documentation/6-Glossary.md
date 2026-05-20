# Glossary

## Robotics

| Term | Meaning |
| --- | --- |
| 6DOF | Six degrees of freedom, one for each robot joint. |
| TCP | Tool Center Point, the working point of the mounted tool. |
| Flange | Final robot frame where tools attach. |
| FK | Forward kinematics, computing TCP pose from joint angles. |
| IK | Inverse kinematics, computing joint angles from desired TCP pose. |
| URDF | XML robot description format used for kinematics and visualization. |
| Joint space | Motion described as joint angles. |
| Cartesian space | Motion described as position and orientation in 3D. |
| Trapezoidal profile | Motion profile with acceleration, cruise, and deceleration phases. |
| Spherical wrist | Wrist layout where the final three joint axes intersect. |
| Singularity | Robot pose where control authority or IK stability is reduced. |

## Firmware

| Term | Meaning |
| --- | --- |
| `CommManager` | Parses serial JSON, dispatches commands, handles batch upload/execution. |
| `JointManager` | Degree-space motion API, soft limits, jog, velocity slices. |
| `StepperManager` | 100 kHz ISR step pulse engine. |
| `CalibrationManager` | Non-blocking homing state machine. |
| `SafetyManager` | E-stop and LED policy. |
| `IOManager` | Debounced inputs and relay outputs. |
| `ConfigManager` | EEPROM-backed config and saved joint positions. |
| `HelperManager` | Save positions and restart the Teensy. |
| `Serial2` | Hardware UART used for Pi-to-Teensy JSON at `921600` baud. |
| `MoveTo` | Absolute single-joint move. |
| `MoveBy` | Relative single-joint move. |
| `MoveMultiple` | Multi-joint position move. |
| `Jog` | Velocity-mode jog using `target` deg/s and `accel` deg/s². |
| `Stop` | Current firmware behavior is a global stop. |
| `StopAll` | Immediate global stop. |
| `Home` | Per-joint homing sequence. |
| `BeginBatch` | Starts firmware batch loading. |
| `M` | One batch velocity segment containing `s` and `a` arrays. |
| `AbortBatch` | Cancels firmware batch loading/execution. |
| `SetVel` | Live six-axis velocity command for streamed linear moves. |
| `ListParameters` | Returns firmware config as a `parameters` event. |

## Pi Bridge

| Term | Meaning |
| --- | --- |
| `server.js` | Express/Socket.IO bootstrap listening on port `5001`. |
| `UARTService.js` | Teensy serial service, ACK tracking, telemetry broadcast. |
| `IKService.js` | Python child process manager and linear stream pacer. |
| `SocketService.js` | Frontend Socket.IO event handlers. |
| `ik_service.py` | Python FK/IK/profile service. |
| `writeTeensy()` | Adds `id`, writes JSON to UART, waits for ACK. |
| `awaiting` | Map of pending Teensy command IDs to promises. |
| `latestTeensyJoints` | Cached last known joint positions. |
| `CONTROL_DT` | Trajectory timestep, commonly `0.02` seconds. |
| `linearMove` | Frontend event for streamed linear motion. |
| `profileMoveToTeensy` | Frontend event for precomputed firmware batch upload. |
| `profileLinear` | Frontend event for previewing a linear profile. |

## Frontend

| Term | Meaning |
| --- | --- |
| `SocketProvider` | Owns the Socket.IO client and connected state. |
| `RobotDataProviders` | Composes robot status, kinematics, IO, logs, and commands providers. |
| `useUpdateData.ts` | Hooks that bridge Socket.IO events into TanStack Query. |
| `RobotStudioTab` | Main robot workspace. |
| `SimRobotCards` | Simulation, IK, pose, and linear move controls. |
| `PhysRobotCards` | Physical robot cards and real hardware actions. |
| `ProgramEditor` | Block programming UI. |
| `CodeGenerator` | Converts blocks to 6AR-style program text. |
| `run6ar.ts` | Lightweight interpreter for generated program text. |
| `RunLogsView` | Program execution and log view. |
| `JointStore` | Zustand store for joint/viewer state. |
| `jointStatusAll` | Event with telemetry for all six joints. |
| `inputStatus` | Event with E-stop, buttons, and limit switch states. |
| `outputStatus` | Event with relay states. |
| `systemStatus` | Event with uptime, E-stop, and homing state. |

## Protocol Examples

| Structure | Example |
| --- | --- |
| MoveTo | `{ "cmd": "MoveTo", "joint": 1, "target": 10, "speed": 20, "accel": 50 }` |
| Jog | `{ "cmd": "Jog", "joint": 2, "target": 15, "accel": 100 }` |
| SetVel | `{ "cmd": "SetVel", "s": [0,0,0,0,0,0], "a": [100,100,100,100,100,100] }` |
| BeginBatch | `{ "cmd": "BeginBatch", "count": 120, "dt": 0.02 }` |
| Batch Segment | `{ "cmd": "M", "s": [1,2,3,4,5,6], "a": [10,10,10,10,10,10] }` |
| Joint Status | `{ "cmd": "jointStatusAll", "data": [{ "joint": 1, "position": 0, "velocity": 0, "acceleration": 0, "target": 0 }] }` |
