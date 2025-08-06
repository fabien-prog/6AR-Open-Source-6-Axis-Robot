// UARTService.js
import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';

export default function initUARTService(io) {
    const TEENSY_PORT = '/dev/ttyAMA0';
    const TEENSY_BAUD = 921600;
    const teensy = new SerialPort({ path: TEENSY_PORT, baudRate: TEENSY_BAUD });
    const parser = teensy.pipe(new ReadlineParser({ delimiter: '\n' }));

    let nextId = 1;
    const awaiting = new Map();

    // timeouts for raw cmds, batching, etc.
    const TIMEOUTS = {
        Home: 60_000,
        Restart: 20_000,
        BeginBatch: 10_000,
        MoveMultiple: 60_000,
        GetJointStatus: 1_000,
        GetSystemStatus: 1_000,
        ListParameters: 2_000,
    };

    let latestTeensyJoints = [0, 0, 0, 0, 0, 0];

    function writeTeensy(cmd, tmoMs = 400) {
        // assign a unique ID
        const id = nextId++;
        cmd.id = id;

        const p = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                awaiting.delete(id);
                const err = new Error('Teensy ACK timeout');
                console.error('[Teensy]', err.message);
                // properly send StopAll (so it still goes through JSON.stringify)
                writeTeensy({ cmd: 'StopAll' }).catch(() => { });
                reject(err);
            }, tmoMs);

            awaiting.set(id, { resolve, reject, timeout });
            teensy.write(JSON.stringify(cmd) + '\n');
        });

        return p;  // no longer swallowing rejections!
    }

    teensy.on('open', () => console.log(`[Teensy] Opened ${TEENSY_PORT}@${TEENSY_BAUD}`));
    teensy.on('error', err => console.error('[Teensy] Serial error:', err));

    parser.on('data', line => {
        console.log('[Teensy:stdout]', line);
        let msg;
        try {
            msg = JSON.parse(line);
        } catch (e) {
            return console.error('[Teensy] Invalid JSON:', e);
        }

        // Update cached state
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
                for (const [, sock] of io.of('/').sockets) {
                    sock.jointLimits = jl;
                }
                break;
            }
        }

        // Resolve ACK if present
        if (msg.id !== undefined && awaiting.has(msg.id)) {
            const { resolve, reject, timeout } = awaiting.get(msg.id);
            clearTimeout(timeout);
            awaiting.delete(msg.id);
            if (msg.status === 'error') reject(new Error(msg.error || 'Teensy error'));
            else resolve(msg);
        }

        // **Always** broadcast the clean event so frontend gets it
        const bc = { ...msg };
        delete bc.id;
        delete bc.status;
        io.emit(bc.cmd, bc);
    });

    // ─── batching helpers (no changes) ─────────────────────────────────
    let batchQueue = [];
    let batchTicker = null;

    function enqueueWindowedBatch(segments, windowSize, intervalMs) {
        let nextIndex = 0;
        batchQueue = [];

        const makeCmd = seg => ({
            cmd: 'MoveMultiple',
            joints: seg.targets.map((_, i) => i + 1),
            targets: seg.targets,
            speeds: seg.speeds,
            accels: seg.accels,
        });

        while (nextIndex < segments.length && batchQueue.length < windowSize) {
            batchQueue.push(makeCmd(segments[nextIndex++]));
        }
        if (batchTicker) clearInterval(batchTicker);

        batchTicker = setInterval(() => {
            if (!batchQueue.length) {
                clearInterval(batchTicker);
                batchTicker = null;
                return;
            }
            writeTeensy(batchQueue.shift()).catch(console.error);
            if (nextIndex < segments.length) {
                batchQueue.push(makeCmd(segments[nextIndex++]));
            }
        }, intervalMs);
    }

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
            writeTeensy(batchQueue.shift()).catch(console.error);
        }, intervalMs);
    }

    return {
        writeTeensy,
        TIMEOUTS,
        latestTeensyJoints: () => latestTeensyJoints,
        enqueueWindowedBatch,
        enqueueBatch,
    };
}
