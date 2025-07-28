# 4-Setup-Guide.md

## Getting Started

This guide explains how to flash the firmware to the Teensy 4.1, run the Pi bridge (Node.js + Python), and launch the React + Electron frontend interface for the 6AR robot.

---

## 1. Flash Firmware to Teensy 4.1

### Directory: `1-firmware/`

You must use **PlatformIO** to upload the firmware.

### Steps to upload code to teensy

1. Install [Teensyduino](https://www.pjrc.com/teensy/teensyduino.html)
2. Open the PlatformIO project in the `1-firmware/` directory
3. Select the board: `Teensy 4.1`
4. Upload the firmware via USB

---

## 2. Run Pi Bridge on Raspberry Pi

### Directory: `2-pi-bridge/`

This part runs the Node.js server, launches the Python IK service, and handles UART communication with the Teensy.

---

### 1. Install System Dependencies

```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip nodejs npm
```

Verify versions:

```bash
node -v
npm -v
python3 --version
```

---

### 2. Clone the Project (if not done yet)

```bash
cd ~
git clone https://github.com/fabien-prog/6AR-Open-Source-6-Axis-Robot.git
cd 6AR-Open-Source-6-Axis-Robot/2-pi-bridge
```

---

### 3. Install Node.js Dependencies

```bash
npm install
```

---

### 4. Create Python Virtual Environment

```bash
python3 -m venv venv
source venv/bin/activate
```

---

### 5. Install Python Packages

```bash
pip install -r requirements.txt
```

If `requirements.txt` is missing, create it:

```txt
numpy
scipy
spatialmath-python
roboticstoolbox-python
```

---

### 6. Start the Bridge Server

```bash
source venv/bin/activate
node server.js
```

Expected terminal output:

```plaintext
[Server] Starting up…
[Server] Python command: /home/pi/6AR-Open-Source-6-Axis-Robot/2-pi-bridge/venv/bin/python ...
[Server] Listening on 0.0.0.0:5000
[Teensy] Opened /dev/ttyAMA0@115200
```

---

## 3. Start the React Frontend UI

### Directory: `3-frontend/`

This runs the UI built with React and Chakra UI.

---

### Steps to run frontend

```bash
cd ../3-frontend
npm install
npm start
```

This launches the frontend at:

```bash
http://localhost:3000
```

To build a static version for deployment on the Pi:

```bash
npm run build
cp -r build/* ../2-pi-bridge/public/
```

---

## ✅ System Check

When running correctly:

* The **React UI** connects to `localhost:5000` via WebSocket (in the Pi-Bridge logs)
* The **Pi bridge server**:

  * Talks to the Teensy over UART (`/dev/ttyAMA0`)
  * Calls the Python IK service
* The **Teensy** executes `MoveMultiple`, `Home`, `Jog`, etc.

---
