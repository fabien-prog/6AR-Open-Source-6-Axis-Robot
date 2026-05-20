# Setup Guide

This guide covers the current firmware, Pi bridge, and frontend layout.

## 1. Firmware

Directory:

```text
1-firmware/
```

The firmware is a PlatformIO Arduino project for Teensy 4.1.

Dependencies are declared in `platformio.ini`:

- `bblanchon/ArduinoJson`
- `waspinator/AccelStepper`

Build or upload with PlatformIO:

```bash
cd 1-firmware
pio run
pio run --target upload
```

The firmware uses `Serial2` for Pi communication and starts it at `921600` baud. The USB debug serial also starts at `921600`.

## 2. Pi Bridge

Directory:

```text
2-pi-bridge/
```

The bridge is a Node.js server plus a Python IK process.

Install system tools on the Pi:

```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip nodejs npm
```

Install Node dependencies:

```bash
cd 2-pi-bridge
npm install
```

Create the Python virtual environment expected by `IKService.js`:

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Start the bridge:

```bash
node server.js
```

Expected bridge details:

- listens on `0.0.0.0:5001`
- serves frontend production files from `2-pi-bridge/public`
- opens Teensy UART at `/dev/ttyAMA0`
- uses `921600` baud
- launches `2-pi-bridge/venv/bin/python -u ik_service.py`

## 3. Frontend

Directory:

```text
3-frontend/
```

Run a local dev UI:

```bash
cd 3-frontend
npm install
npm run dev
```

Vite normally serves the dev app at:

```text
http://localhost:5173
```

The default Socket.IO bridge URL is:

```text
http://192.168.0.55:5001
```

Override it with:

```bash
VITE_SOCKET_URL=http://localhost:5001 npm run dev
```

or set `6ar.socketUrl` in browser local storage.

## 4. Build Frontend for the Pi Bridge

```bash
cd 3-frontend
npm run build
mkdir -p ../2-pi-bridge/public
cp -r dist/* ../2-pi-bridge/public/
```

Then start:

```bash
cd ../2-pi-bridge
node server.js
```

Open:

```text
http://<pi-ip>:5001
```

## 5. Hardware/Serial Check

When everything is connected correctly:

- Teensy firmware reports readiness on USB serial at `921600`
- Pi bridge logs `[Teensy] Opened /dev/ttyAMA0@921600`
- frontend header shows `Online`
- `GetJointStatus`, `GetSystemStatus`, `GetInputs`, and `ListParameters` produce live UI updates

If the bridge cannot open `/dev/ttyAMA0`, check Pi UART settings and user permissions for the serial device.
