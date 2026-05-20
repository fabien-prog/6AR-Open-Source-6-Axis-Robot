# 6AR Frontend

React 19 + TypeScript + Vite control interface for the 6AR robot.

The app is the operator UI for simulation, physical robot control, program editing, run logs, settings, IO, FK/IK requests, and live 3D visualization.

## Stack

- React 19, TypeScript, Vite 7
- Tailwind CSS 4 via `@tailwindcss/vite`
- shadcn-style UI components built on Radix UI
- Socket.IO client for the Pi bridge
- TanStack Query for cached robot status and telemetry
- Zustand for joint/viewer state
- Three.js, `@react-three/fiber`, `@react-three/drei`, `urdf-loader`
- `@hello-pangea/dnd` for block programming drag and drop
- Sonner for toasts

## Run Locally

```bash
npm install
npm run dev
```

Vite prints the local URL, normally `http://localhost:5173`.

By default the UI connects to:

```text
http://192.168.0.55:5001
```

Override the bridge URL with either:

```bash
VITE_SOCKET_URL=http://localhost:5001 npm run dev
```

or in the browser console:

```js
localStorage.setItem("6ar.socketUrl", "http://localhost:5001")
```

## Scripts

```bash
npm run dev       # start Vite dev server
npm run build     # type-check and build production assets
npm run lint      # run ESLint
npm run preview   # preview the production build
```

## Source Layout

```text
src/
├── components/        # shared UI, modals, theme, background
├── contexts/          # Socket provider and robot data providers
├── features/
│   ├── App/           # main shell and tab navigation
│   ├── Program/       # block editor, code generator, variables, math editor
│   ├── Robot/         # robot studio, sim/physical cards, STL support
│   ├── Runner/        # program manager and run logs
│   └── Settings/      # settings drawer and parameter UI
├── hooks/             # Socket.IO + TanStack Query data hooks
├── lib/               # 6AR runner and motion helpers
├── stores/            # Zustand stores
└── utils/             # syntax highlighting helpers
```

## Runtime Shape

`main.tsx` wraps the app with:

- `QueryClientProvider`
- theme provider
- `SocketProvider`
- `RobotDataProviders`
- `Toaster`

`SocketProvider` owns the Socket.IO client and connection state. The robot providers split live data into status, kinematics, IO, logs, and commands so feature components can subscribe only to what they need.

## Main UI

The first screen is the control workspace, not a landing page:

- `Robot` tab: simulation, physical robot controls, pose editor, linear motion, 3D robot studio
- `Program` tab: block programming and generated `.6ar`-style code
- `Run` tab: run logs and program execution state
- settings drawer: robot parameters and configuration controls
- header badges: bridge connection, system status, uptime
- E-stop button: sends `StopAll`

## Bridge Events

The UI sends raw firmware commands through the Pi bridge with:

```ts
socket.emit("cmd", { cmd: "GetJointStatus" })
```

It also uses higher-level bridge events:

- `ik_request`
- `fk_request`
- `profileLinear`
- `linearMove`
- `profileMoveToTeensy`

Important incoming events include:

- `jointStatusAll`, `jointStatus`
- `inputStatus`, `outputStatus`
- `systemStatus`, `parameters`, `homed`
- `ik_response`, `ik_error`
- `fk_response`, `fk_error`
- `profileLinear_response`, `profileLinear_error`
- `linearMoveStarted`, `linearMoveComplete`, `linearMove_error`
- `BatchExecStart`, `SegmentLoaded`, `BatchComplete`, `BatchAborted`

## Production Build for Pi Bridge

The bridge serves static assets from `2-pi-bridge/public`.

```bash
npm run build
mkdir -p ../2-pi-bridge/public
cp -r dist/* ../2-pi-bridge/public/
```
