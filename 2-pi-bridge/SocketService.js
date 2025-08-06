// SocketService.js
export default function initSocketService(
    io,
    requestIk,
    sendLinearMove,
    writeTeensy,
    TIMEOUTS
) {
    io.on('connection', socket => {
        console.log('[Socket] connect:', socket.id);

        // grab joint limits immediately
        writeTeensy({ cmd: 'ListParameters' })
            .catch(e => console.error('[Teensy]', e.message));

        // ——— non-batched linear stream (preserved twice) ———
        socket.on('linearMove', msg => {
            console.log('[Socket] linearMove (stream):', msg);
            sendLinearMove(msg);
        });
        socket.on('linearMove', msg => {
            console.log('[Socket] linearMove (stream):', msg);
            sendLinearMove(msg);
        });

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

        // profile preview
        socket.on('profileLinear', async req => {
            const jl = socket.jointLimits;
            if (!jl) {
                return socket.emit('profileLinear_error', {
                    error: 'Waiting for joint limits…'
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

        // batched move → Teensy
        socket.on('profileMoveToTeensy', async payload => {
            console.log('[Socket] profileMoveToTeensy:', payload);

            let jl = socket.jointLimits;
            if (!jl) {
                await writeTeensy({ cmd: 'ListParameters' }).catch(() => { });
                jl = socket.jointLimits;
                if (!jl) {
                    return socket.emit('profileMoveToTeensy_error', {
                        error: 'No joint limits available yet'
                    });
                }
            }

            let prof;
            try {
                prof = await requestIk({
                    profileMoveToTeensy: payload,
                    jointLimits: jl
                });
            } catch (err) {
                console.error(
                    '[Socket] IK profileMoveToTeensy failed:',
                    err
                );
                return socket.emit('profileMoveToTeensy_error', {
                    error: err.message
                });
            }

            const { dt, speeds, accels } = prof;
            const N = speeds.length;
            if (!N || accels.length !== N) {
                return socket.emit('profileMoveToTeensy_error', {
                    error: 'Invalid trajectory from IK'
                });
            }

            try {
                await writeTeensy(
                    { cmd: 'BeginBatch', count: N, dt },
                    TIMEOUTS.BeginBatch
                );
            } catch (err) {
                console.error('[Teensy] BeginBatch failed:', err.message);
                return socket.emit('profileMoveToTeensy_error', {
                    error: 'BeginBatch failed: ' + err.message
                });
            }

            for (let i = 0; i < N; i++) {
                const cmd = {
                    cmd: 'M',
                    s: speeds[i],
                    a: accels[i].map(x => Math.abs(x)),
                };
                try {
                    await writeTeensy(cmd, TIMEOUTS.MoveMultiple);
                    console.log(`[Teensy] slice ${i + 1}/${N} loaded`);
                } catch (err) {
                    console.error(
                        `[Teensy] slice ${i + 1} failed:`,
                        err.message
                    );
                    await writeTeensy({ cmd: 'StopAll' }).catch(() => { });
                    return socket.emit('profileMoveToTeensy_error', {
                        error: `Slice ${i + 1} upload failed`
                    });
                }
            }

            socket.emit('profileMoveToTeensy_queued', { count: N });
        });

        // raw passthrough
        socket.on('cmd', msg => {
            console.log('[Socket] raw cmd → Teensy:', msg);
            const tmo = TIMEOUTS[msg.cmd] ?? 400;
            writeTeensy(msg, tmo).catch(e =>
                console.error('[Teensy]', e.message)
            );
        });
    });
}
