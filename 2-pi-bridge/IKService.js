// IKService.js
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

export default function initIKService(io, writeTeensy) {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    const PYTHON_CMD = path.join(__dirname, 'venv', 'bin', 'python');
    const IK_SCRIPT = path.join(__dirname, 'ik_service.py');

    console.log('[Server] Python command:', PYTHON_CMD, IK_SCRIPT);

    const ik = spawn(PYTHON_CMD, ['-u', IK_SCRIPT]);
    ik.on('error', err => console.error('[IKProcess] spawn error:', err));

    const ikRl = readline.createInterface({ input: ik.stdout });

    ik.stderr.on('data', chunk => {
        chunk
            .toString()
            .split('\n')
            .filter(l => l.trim())
            .forEach(l => console.error('[IKService:stderr]', l));
    });

    let ikBusy = false;
    const pending = [];

    function sendNext() {
        if (ikBusy || !pending.length) return;
        const { msg } = pending[0];
        console.log('[Server] IK stdin →', msg);
        ik.stdin.write(JSON.stringify(msg) + '\n');
        ikBusy = true;
    }

    function requestIk(msg) {
        console.log('[Server] → IKService:', msg);
        return new Promise((resolve, reject) => {
            pending.push({ msg, resolve, reject });
            sendNext();
        });
    }

    ikRl.on('line', line => {
        console.log('[IKService:stdout]', line);
        let obj;
        try {
            obj = JSON.parse(line);
        } catch (e) {
            if (pending.length) {
                pending.shift().reject(e);
                ikBusy = false;
                sendNext();
                return;
            }
            console.warn('[IKService] Non-JSON:', line);
            return;
        }

        if (obj.type === 'linearMoveError') {
            console.warn('[IKService] linearMoveError:', obj.error);
            writeTeensy({ cmd: 'StopAll' }).catch(e =>
                console.error('[Teensy]', e.message)
            );
            io.emit('linearMove_error', { error: obj.error });
            return;
        }

        if (obj.status === 'linearMoveComplete') {
            io.emit('linearMoveComplete');
            return;
        }

        if (obj.type === 'profileLinearError') {
            io.emit('profileLinear_error', { error: obj.error });
            return;
        }

        if (!pending.length) {
            console.warn('[IKService] no pending promise for', obj);
            return;
        }

        const { resolve } = pending.shift();
        resolve(obj);
        ikBusy = false;
        sendNext();
    });

    function sendLinearMove(msg) {
        console.log('[Server] linearMove (stream):', msg);
        ik.stdin.write(JSON.stringify({ linearMove: msg }) + '\n');
    }

    return {
        requestIk,
        sendLinearMove,
    };
}
