# Frontend Overview

## Architecture

```text
[Operator]
    ⇅
[React 19 + TypeScript + Vite UI]
    ⇅ Socket.IO
[Node Pi Bridge on :5001]
    ⇅ stdin/stdout            ⇅ UART JSON
[Python IK Service]       [Teensy Firmware]
```

The frontend is a browser-based Vite app. It is not currently an Electron app.

## Technologies

- React 19 functional components and hooks
- TypeScript
- Vite 7 with `@vitejs/plugin-react-swc`
- Tailwind CSS 4
- shadcn-style components built on Radix UI
- Socket.IO client
- TanStack Query
- Zustand
- Three.js, `@react-three/fiber`, `@react-three/drei`, `urdf-loader`
- `@hello-pangea/dnd`
- Sonner toasts

## Important Files

```text
src/main.tsx                         # Providers and React root
src/App.tsx                          # app wrapper and background
src/features/App/MainPage.tsx        # shell, tabs, settings drawer, E-stop
src/contexts/SocketContext.tsx       # Socket.IO client and connection state
src/contexts/robot/                  # status, kinematics, IO, logs, commands
src/hooks/useUpdateData.ts           # Socket/TanStack Query data hooks
src/stores/JointStore.ts             # Zustand joint/viewer store
src/features/Robot/RobotStudioTab.tsx
src/features/Robot/SimRobotCards.tsx
src/features/Robot/PhysRobotCards.tsx
src/features/Program/ProgramEditor.tsx
src/features/Program/BlockEditor.tsx
src/features/Program/CodeGenerator.ts
src/lib/run6ar.ts                    # small interpreter for generated code
```

## Providers

`main.tsx` wraps the app with:

- `QueryClientProvider`
- `ThemeProvider`
- `SocketProvider`
- `RobotDataProviders`
- `Toaster`

`RobotDataProviders` composes:

- `RobotStatusProvider`
- `RobotKinematicsProvider`
- `RobotIOProvider`
- `RobotLogsProvider`
- `RobotCommandsProvider`

## Socket Connection

The bridge URL is selected in this order:

1. `localStorage.getItem("6ar.socketUrl")`
2. `VITE_SOCKET_URL`
3. `http://192.168.0.55:5001`

The connection uses Socket.IO with websocket transport.

## UI Areas

- `Robot`: robot studio, simulation controls, physical robot controls, FK/IK, pose editor, linear move tools, STL support
- `Program`: block editor, variable editor, generated 6AR-like program text
- `Run`: program run logs and execution state
- settings drawer: parameter/configuration UI
- header: online/offline badge, status badge, uptime, E-stop button

## Data Flow

The frontend generally sends robot firmware commands through:

```ts
socket.emit("cmd", { cmd: "MoveTo", joint: 1, target: 10, speed: 20, accel: 50 })
```

`UARTService.js` adds the command `id` before writing to the Teensy. Firmware replies are broadcast back to the UI under their `cmd` event names.

Higher-level motion and solver requests use dedicated events:

- `ik_request`
- `fk_request`
- `profileLinear`
- `linearMove`
- `profileMoveToTeensy`

## Current Features

- live bridge connection state
- live joint status and FK data
- digital input/output monitoring
- firmware parameter loading
- per-joint `Move`, `MoveTo`, `MoveBy`, `MoveMultiple`, `Jog`, `Stop`, `StopAll`
- per-joint and all-axis homing workflow
- IK pose editing
- linear motion preview and streaming
- batch profile upload to firmware
- 3D robot visualization
- block programming with generated code
- run logs and command/event reporting

## Program Runner

The program tooling generates and interprets a compact 6AR-style language.

Supported parser concepts in `src/lib/run6ar.ts` include:

- `CONST Number`
- `VAR Number`
- `VAR Coordinate`
- `PROC Main`
- `Home;`
- `MoveJ`
- `MoveL`
- `IF`
- `FOR`
- counters
- simple assignments
- `LOG`

`CodeGenerator.ts` also emits `SetDO` and `WaitDI` syntax, but the runner only executes statements currently handled by `run6ar.ts`.

## Build and Deploy

```bash
cd 3-frontend
npm install
npm run build
mkdir -p ../2-pi-bridge/public
cp -r dist/* ../2-pi-bridge/public/
```

The Pi bridge serves those files from `2-pi-bridge/public`.
