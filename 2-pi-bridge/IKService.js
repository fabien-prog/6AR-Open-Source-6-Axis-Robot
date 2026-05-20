// IKService.js
import { spawn }         from 'child_process';
import path              from 'path';
import { fileURLToPath } from 'url';
import readline          from 'readline';

export default function initIKService(io, writeTeensy) {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname  = path.dirname(__filename);

    const PYTHON_CMD = path.join(__dirname, 'venv', 'bin', 'python');
    const IK_SCRIPT  = path.join(__dirname, 'ik_service.py');

    console.log('[IKService] spawning', PYTHON_CMD, IK_SCRIPT);
    const ik = spawn(PYTHON_CMD, ['-u', IK_SCRIPT]);
    ik.on('error', err => console.error('[IKProcess] spawn error:', err));

    const ikRl = readline.createInterface({ input: ik.stdout });

    ik.stderr.on('data', chunk =>
        chunk.toString().split('\n').filter(l => l.trim())
             .forEach(l => console.error('[IKService:stderr]', l))
    );

    ik.on('close', code => {
        console.error(`[IKService] Python exited (code ${code})`);
        const err = new Error(`IK process exited (code ${code})`);
        while (pending.length) pending.shift().reject(err);
        ikBusy = false;
        cancelStream();
    });

    // ── Request / response queue ─────────────────────────────────────────
    // All Python interaction goes through this queue — one request in-flight
    // at a time.  sendLinearMove() also uses it so ikBusy is always accurate.
    let ikBusy = false;
    const pending = [];

    function sendNext() {
        if (ikBusy || !pending.length) return;
        ik.stdin.write(JSON.stringify(pending[0].msg) + '\n');
        ikBusy = true;
    }

    function requestIk(msg) {
        return new Promise((resolve, reject) => {
            pending.push({ msg, resolve, reject });
            sendNext();
        });
    }

    // ── Python stdout handler ─────────────────────────────────────────────
    // Every line Python prints resolves the head of the pending queue.
    // There are no unsolicited multi-line streams from Python anymore —
    // compute_linear_stream returns ONE JSON object containing all steps.
    ikRl.on('line', line => {
        let obj;
        try {
            obj = JSON.parse(line);
        } catch (e) {
            // Corrupt line — fail the waiting caller
            if (pending.length) {
                const { reject } = pending.shift();
                ikBusy = false;
                reject(new Error(`IK JSON parse error: ${e.message}`));
                sendNext();
            } else {
                console.warn('[IKService] non-JSON from Python:', line.slice(0, 120));
            }
            return;
        }

        // Log a short summary — never dump a full trajectory to the console
        if (obj.steps !== undefined) {
            console.log(`[IKService] ← trajectory: ${obj.steps.length} steps, dt=${obj.dt}s`);
        } else if (obj.error) {
            console.error('[IKService] ← error:', obj.error);
        } else {
            console.log('[IKService] ←', JSON.stringify(obj).slice(0, 120));
        }

        if (!pending.length) {
            console.warn('[IKService] received reply with no pending caller');
            return;
        }

        const { resolve } = pending.shift();
        resolve(obj);
        ikBusy = false;
        sendNext();
    });

    // ── Streaming trajectory state ────────────────────────────────────────
    let streamTicker = null;

    function cancelStream() {
        if (streamTicker !== null) {
            clearInterval(streamTicker);
            streamTicker = null;
            writeTeensy({ cmd: 'StopAll' }).catch(() => {});
        }
    }

    // Pace pre-computed steps to the Teensy at exactly dtMs intervals.
    // Node.js setInterval gives ±2–5 ms jitter; the stepper ISR at 100 kHz
    // keeps stepping at the last commanded velocity between ticks, so jitter
    // only causes a fractional-millisecond velocity-update slip — acceptable
    // for a stepper robot.
    function startPacedStream(steps, dtMs) {
        cancelStream();   // abort any move already in progress
        let i = 0;
        streamTicker = setInterval(() => {
            if (i >= steps.length) {
                clearInterval(streamTicker);
                streamTicker = null;
                writeTeensy({ cmd: 'StopAll' }).catch(() => {});
                io.emit('linearMoveComplete');
                return;
            }
            const { s, a } = steps[i++];
            // Fire-and-forget: do NOT await ACK here.
            // At 921600 baud a ~120-byte SetVel + ACK round-trips in < 2 ms,
            // well within the 20 ms budget.  The 400 ms timeout is a safety net.
            writeTeensy({ cmd: 'SetVel', s, a }, 400)
                .catch(e => console.error('[Teensy] SetVel err:', e.message));
        }, dtMs);
    }

    // ── Public: called by SocketService when frontend emits 'linearMove' ─
    function sendLinearMove(msg) {
        // Cancel any move currently executing before starting a new one.
        // If Python is mid-computation for a previous move, the result will
        // arrive and startPacedStream will call cancelStream() again — no-op.
        cancelStream();

        requestIk({ linearMoveStream: msg })
            .then(result => {
                if (result.error) {
                    io.emit('linearMove_error', { error: result.error });
                    return;
                }
                if (!result.steps || result.steps.length === 0) {
                    io.emit('linearMoveComplete');
                    return;
                }
                const dtMs = Math.round((result.dt ?? 0.02) * 1000);
                console.log(`[IKService] starting stream: ${result.steps.length} steps @ ${dtMs} ms`);
                startPacedStream(result.steps, dtMs);
                io.emit('linearMoveStarted', { count: result.steps.length, dtMs });
            })
            .catch(err => {
                console.error('[IKService] sendLinearMove failed:', err.message);
                io.emit('linearMove_error', { error: err.message });
            });
    }

    return { requestIk, sendLinearMove };
}
