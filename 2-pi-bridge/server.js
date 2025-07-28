// ─── Imports ──────────────────────────────────────────────────────
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';
import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';

// ─── Resolve __dirname in ES module scope ─────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Python IK Service Paths ──────────────────────────────────────
const PYTHON_CMD = path.join(__dirname, 'venv', 'bin', 'python');
const IK_SCRIPT = path.join(__dirname, 'ik_service.py');

console.log('[Server] Starting up…');
console.log('[Server] Python command:', PYTHON_CMD, IK_SCRIPT);

// ─── Setup: Awaiting Command Responses ────────────────────────────
let nextId = 1;                         // Incremental message ID
const awaiting = new Map();            // Tracks pending promises per ID
const TIMEOUTS = {                     // Custom timeouts for slow ops
  Home: 60_000,
  Restart: 20_000,
  MoveMultiple: 10_000,
  // fallback is 400 ms if not specified
};

// ─── Express App and HTTP Server ─────────────────────────────────
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] } // Enable all clients
});

// ─── Serve React frontend build ──────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ─── Spawn Python IK Process ─────────────────────────────────────
const ik = spawn(PYTHON_CMD, ['-u', IK_SCRIPT]); // -u for unbuffered stdout
ik.on('error', err => console.error('[IKProcess] spawn error:', err));

// ─── Send JSON command to Teensy with optional timeout ───────────
function writeTeensy(cmd, tmoMs = 400) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    cmd.id = id;  // Attach unique ID
    const timeout = setTimeout(() => {
      awaiting.delete(id);
      reject(new Error('Teensy ACK timeout'));
      io.emit('teensy_timeout', { id, cmd }); // Notify UI of failure
      teensy.write('{"cmd":"StopAll"}\n');     // Optional panic stop
    }, tmoMs);

    awaiting.set(id, { resolve, reject, timeout });
    teensy.write(JSON.stringify(cmd) + '\n');
  });
}

// ─── Python stdout/stdin helpers ─────────────────────────────────
const ikRl = readline.createInterface({ input: ik.stdout });

// Log and parse stderr output from Python
ik.stderr.on('data', chunk => {
  chunk.toString()
    .split('\n')
    .filter(l => l.trim())
    .forEach(l => console.error('[IKService:stderr]', l));
});

// Manage one-request-at-a-time pipeline to IK
let ikBusy = false;
const pending = [];  // FIFO queue of messages to Python

function requestIk(msg) {
  console.log('[Server] → IKService:', msg);
  return new Promise((resolve, reject) => {
    pending.push({ msg, resolve, reject });
    sendNext(); // Start processing
  });
}

function sendNext() {
  if (ikBusy || pending.length === 0) return;
  const { msg } = pending[0];
  console.log('[Server] IK stdin →', msg);
  ik.stdin.write(JSON.stringify(msg) + '\n');
  ikBusy = true;
}

// Handle each line of output from Python
ikRl.on('line', line => {
  console.log('[IKService:stdout]', line);
  let obj;
  try {
    obj = JSON.parse(line);
  } catch (e) {
    if (pending.length) {
      pending.shift().reject(e);
      ikBusy = false;
      return sendNext();
    }
    console.warn('[IKService] Non-JSON:', line);
    return;
  }

  // Handle streaming error messages
  if (obj.type === 'linearMoveError') {
    console.warn('[IKService] linearMoveError:', obj.error);
    writeTeensy({ cmd: 'StopAll' }).catch(e =>
      console.error('[Teensy]', e.message)
    );
    io.emit('linearMove_error', { error: obj.error });
    return;
  }

  // Handle move completion signal
  if (obj.status === 'linearMoveComplete') {
    io.emit('linearMoveComplete');
    return;
  }

  // Handle profile generation error
  if (obj.type === 'profileLinearError') {
    return io.emit('profileLinear_error', { error: obj.error });
  }

  // Return resolved result to original caller
  if (!pending.length) {
    console.warn('[IKService] no pending promise for', obj);
    return;
  }
  const { resolve } = pending.shift();
  resolve(obj);
  ikBusy = false;
  sendNext();
});

// ─── Teensy Serial Connection Setup ──────────────────────────────
const TEENSY_PORT = '/dev/ttyAMA0';
const TEENSY_BAUD = 115200;
const teensy = new SerialPort({ path: TEENSY_PORT, baudRate: TEENSY_BAUD });
const parser = teensy.pipe(new ReadlineParser({ delimiter: '\n' }));

let latestTeensyJoints = [0, 0, 0, 0, 0, 0];  // Latest known joint positions
let batchQueue = [];                         // Command queue
let batchTicker = null;                      // Interval handler

// Send one command per interval (for linear moves)
function enqueueBatch(cmds, intervalMs) {
  batchQueue = batchQueue.concat(cmds);
  if (batchTicker) clearInterval(batchTicker);

  let lastTime = Date.now();
  batchTicker = setInterval(() => {
    const now = Date.now();
    console.log('actual Δt:', now - lastTime, 'ms');
    lastTime = now;

    if (!batchQueue.length) {
      clearInterval(batchTicker);
      batchTicker = null;
      return;
    }

    (async () => {
      try { await writeTeensy(batchQueue.shift()); }
      catch (e) { console.error(e.message); }
    })();
  }, intervalMs);
}

// ─── Teensy Serial Event Handlers ───────────────────────────────
teensy.on('open', () => console.log(`[Teensy] Opened ${TEENSY_PORT}@${TEENSY_BAUD}`));
teensy.on('error', err => console.error('[Teensy] Serial error:', err));

// Handle incoming serial lines from Teensy
parser.on('data', line => {
  console.log('[Teensy:stdout]', line);
  let msg;
  try {
    msg = JSON.parse(line);
  } catch (e) {
    return console.error('[Teensy] Invalid JSON:', e);
  }

  // Update joint states and parameter cache
  switch (msg.cmd) {
    case 'jointStatusAll':
      latestTeensyJoints = msg.data.map(d => d.position);
      break;
    case 'jointStatus':
      latestTeensyJoints[msg.data.joint - 1] = msg.data.position;
      break;
    case 'parameters': {
      const p = msg.data.params;
      const jl = { maxSpeed: [], maxAccel: [] };
      for (let j = 1; j <= 6; j++) {
        jl.maxSpeed.push(+p[`joint${j}.maxSpeed`]);
        jl.maxAccel.push(+p[`joint${j}.maxAccel`]);
      }
      // Attach joint limits to each socket
      for (const [, sock] of io.of('/').sockets) sock.jointLimits = jl;
      break;
    }
  }

  // Resolve any pending ACKs by ID
  if (msg.hasOwnProperty('id') && awaiting.has(msg.id)) {
    const { resolve, reject, timeout } = awaiting.get(msg.id);
    clearTimeout(timeout);
    awaiting.delete(msg.id);
    if (msg.status === 'error') reject(new Error(msg.error || 'Teensy error'));
    else resolve(msg);
  }

  // Broadcast cleaned message to UI
  const broadcast = { ...msg };
  delete broadcast.id;
  delete broadcast.status;
  io.emit(broadcast.cmd, broadcast);
});

// ─── Socket.IO Message Handlers ────────────────────────────────
io.on('connection', socket => {
  console.log('[Socket] connect:', socket.id);

  // Request parameter info on connect
  writeTeensy({ cmd: "ListParameters" })
    .catch(e => console.error('[Teensy]', e.message));

  // IK request
  socket.on('ik_request', async msg => {
    console.log('[Socket] ik_request:', msg);
    try {
      const resp = await requestIk(msg);
      socket.emit('ik_response', resp);
    } catch (err) {
      console.error('[Socket] ik_error:', err);
      socket.emit('ik_error', { error: err.message });
    }
  });

  // FK request
  socket.on('fk_request', async msg => {
    console.log('[Socket] fk_request:', msg);
    try {
      const resp = await requestIk({ ...msg, type: 'fk' });
      socket.emit('fk_response', resp);
    } catch (err) {
      console.error('[Socket] fk_error:', err);
      socket.emit('fk_error', { error: err.message });
    }
  });

  // Profile generation for preview (not executed)
  socket.on('profileLinear', async req => {
    const jl = socket.jointLimits;
    if (!jl) {
      return socket.emit('profileLinear_error', {
        error: "Waiting for joint limits…"
      });
    }
    try {
      const payload = { profileLinear: req, jointLimits: jl };
      const profile = await requestIk(payload);
      socket.emit('profileLinear_response', profile);
    } catch (e) {
      socket.emit('profileLinear_error', { error: e.message });
    }
  });

  // Batched linear movement execution
  socket.on('linearMoveToTeensy', async msg => {
    console.log('[Socket] linearMoveToTeensy (batch):', msg);
    let resp;
    try {
      resp = await requestIk({ linearMoveToTeensy: msg });
    } catch (err) {
      console.error('[Socket] IK batch failed', err);
      return;
    }

    const segments = (resp.segments || []).slice();

    // Remove first/last if no motion
    if (segments.length > 1 &&
      segments[0].speeds.every(v => v === 0) &&
      segments[0].accels.every(a => a === 0)) segments.shift();
    if (segments.length > 1 &&
      segments[segments.length - 1].speeds.every(v => v === 0) &&
      segments[segments.length - 1].accels.every(a => a === 0)) segments.pop();
    if (!segments.length) return console.warn('[Socket] All segments no-op');

    const joints = segments[0].targets.map((_, i) => i + 1);
    const cmdList = segments.map(seg => ({
      cmd: 'MoveMultiple',
      joints,
      targets: seg.targets,
      speeds: seg.speeds,
      accels: seg.accels
    }));
    const intervalMs = Math.round((resp.dt || 0.05) * 1000);
    console.log(`[Socket] Enqueuing ${cmdList.length} @ ${intervalMs}ms`);
    enqueueBatch(cmdList, intervalMs);
  });

  // Streaming (non-batched) linear movement
  socket.on('linearMove', msg => {
    console.log('[Socket] linearMove (stream):', msg);
    ik.stdin.write(JSON.stringify({ linearMove: msg }) + '\n');
  });

  // Raw command passthrough to Teensy
  socket.on('cmd', msg => {
    console.log('[Socket] raw cmd → Teensy:', msg);
    const tmo = TIMEOUTS[msg.cmd] ?? 400;
    writeTeensy(msg, tmo).catch(e => console.error('[Teensy]', e.message));
  });
});

// ─── Start Listening ───────────────────────────────────────────
server.listen(5000, '0.0.0.0', () => {
  console.log('[Server] Listening on 0.0.0.0:5000');
});
