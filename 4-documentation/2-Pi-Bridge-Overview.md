# Pi Bridge Overview

## Purpose

`2-pi-bridge/` is the coordination layer between the React frontend, the Python kinematics service, and the Teensy firmware. It exposes a Socket.IO API to the UI, serves the production frontend build, starts the Python IK process, and sends newline-delimited JSON to the Teensy over UART.

## Current Files

```text
2-pi-bridge/
├── server.js          # Express + HTTP + Socket.IO bootstrap
├── UARTService.js     # Teensy serial port, ACK tracking, telemetry broadcast
├── IKService.js       # Python child process queue and streamed motion pacing
├── SocketService.js   # Socket.IO event handlers
├── ik_service.py      # FK, IK, trajectory and profile generation
├── requirements.txt   # pinned Python dependencies
└── package.json       # Node dependencies
```

## Server

`server.js`:

- starts Express and Socket.IO
- serves static files from `2-pi-bridge/public`
- initializes UART, IK, and socket services
- listens on `0.0.0.0:5001`

```bash
node server.js
```

Expected startup lines include:

```text
[Server] Starting up…
[IKService] spawning .../2-pi-bridge/venv/bin/python .../ik_service.py
[Server] Listening on 0.0.0.0:5001
[Teensy] Opened /dev/ttyAMA0@921600
```

## UART Service

`UARTService.js` owns the Teensy serial connection.

- port: `/dev/ttyAMA0`
- baud: `921600`
- framing: one JSON object per line
- parser: `@serialport/parser-readline`
- outgoing commands get an auto-incrementing `id`
- ACKs resolve pending promises by matching `id`
- timeout failures attempt `StopAll`
- all clean Teensy messages are broadcast to the frontend by `cmd` name

Cached state:

- `latestTeensyJoints`: last known joint positions
- per-socket `jointLimits`: populated from `parameters`
- `awaiting`: command ID to pending ACK

Known timeout overrides include `Home`, `Restart`, `BeginBatch`, `MoveMultiple`, `GetJointStatus`, `GetSystemStatus`, and `ListParameters`.

## IK Service

`IKService.js` starts:

```text
2-pi-bridge/venv/bin/python -u 2-pi-bridge/ik_service.py
```

All Python requests go through a FIFO queue with one request in flight at a time. JSON is written to Python stdin and one JSON response is read from stdout.

Responsibilities:

- `requestIk(msg)`: FK, IK, profile, and trajectory requests
- `sendLinearMove(msg)`: asks Python for `linearMoveStream`, then paces velocity slices to Teensy
- `startPacedStream(steps, dtMs)`: sends `SetVel` commands at the requested interval
- `cancelStream()`: stops an active stream and sends `StopAll`

## Socket.IO Events

Frontend to bridge:

| Event | Purpose |
| --- | --- |
| `cmd` | Raw Teensy passthrough through `writeTeensy()` |
| `ik_request` | Solve IK for a pose |
| `fk_request` | Solve FK for joint angles |
| `profileLinear` | Generate a profile preview without moving hardware |
| `linearMove` | Compute a linear trajectory and stream `SetVel` slices |
| `profileMoveToTeensy` | Compute profile, upload with `BeginBatch` + `M` slices |

Bridge to frontend:

| Event | Purpose |
| --- | --- |
| `jointStatusAll`, `jointStatus` | Joint telemetry from firmware |
| `inputStatus`, `outputStatus` | Digital IO state |
| `systemStatus` | Uptime, E-stop, homing state |
| `parameters` | Firmware config returned by `ListParameters` |
| `ik_response`, `ik_error` | IK result or error |
| `fk_response`, `fk_error` | FK result or error |
| `profileLinear_response`, `profileLinear_error` | Preview profile result |
| `linearMoveStarted`, `linearMoveComplete`, `linearMove_error` | Streamed motion lifecycle |
| `profileMoveToTeensy_queued`, `profileMoveToTeensy_error` | Batch upload lifecycle |
| `BatchExecStart`, `SegmentLoaded`, `BatchComplete`, `BatchAborted` | Firmware batch events |

## Motion Modes

### Streaming Linear Move

1. Frontend emits `linearMove`.
2. Bridge sends `{ linearMoveStream: ... }` to Python.
3. Python returns `{ steps, dt }`.
4. Bridge sends firmware `SetVel` packets at `dt`.
5. Bridge sends `StopAll` and emits `linearMoveComplete` when done.

### Batched Profile to Teensy

1. Frontend emits `profileMoveToTeensy`.
2. Bridge ensures joint limits are available from `ListParameters`.
3. Python returns `dt`, `speeds`, and `accels`.
4. Bridge sends `BeginBatch`.
5. Bridge uploads each segment with `M`.
6. Firmware executes internally and emits batch lifecycle events.

## Python Service

`ik_service.py` loads the URDF from:

```text
2-pi-bridge/6AR-000-000.SLDASM/urdf/6AR-000-000.SLDASM.urdf
```

It uses Robotics Toolbox, SpatialMath, NumPy, SciPy, and related dependencies from `requirements.txt`.

Core request families:

- IK: desired position + quaternion, optional seed
- FK: joint angles
- `profileLinear`: preview linear Cartesian profile
- `profileMoveToTeensy`: profile for firmware batch execution
- `linearMoveStream`: precomputed velocity slices for paced streaming

## Error Handling

- Teensy ACK timeout: clears pending ACK and tries `StopAll`
- invalid Teensy JSON: logged and ignored
- Python JSON parse failure: rejects the pending request
- Python process exit: rejects all pending requests and cancels active stream
- IK/profile failures: emitted back to the frontend as error events
