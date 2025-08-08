// syncMotion.js

/**
 * Queries the real robot for its current joint positions,
 * builds synchronized trapezoidal speed/accel profiles so
 * that all axes arrive together, and then emits a single
 * moveMultiple(...) command.
 *
 * @param {() => Promise<Array<{position:number}>>} getAllJointStatus
 * @param {number[]} poseJoints   — target joint angles [j1…j6]
 * @param {{ [key:string]:number }} parameters — jointN.maxSpeed / maxAccel, etc.
 * @param {(joints:number[], targets:number[], speeds:number[], accels:number[]) => void} moveMultiple
 * @param {(opts:{title:string,description?:string,status:"error"|"warning"|"success"|"info"})=>void} [toast]
 */
export async function movePhysicalToVirtual({
    getAllJointStatus,
    poseJoints,
    parameters,
    moveMultiple,
    toast = () => { },
}) {
    // ── 0) Fast sanity: make sure we have 6 targets
    if (!Array.isArray(poseJoints) || poseJoints.length < 6) {
        toast({ title: "Invalid targets", description: "Need 6 joint angles.", status: "error" });
        return;
    }

    // ── 1) Query current positions
    let statuses;
    try {
        statuses = await getAllJointStatus();
    } catch {
        toast({ title: "Failed to query joint status", status: "error" });
        return;
    }
    if (!Array.isArray(statuses) || statuses.length !== 6) {
        toast({ title: "Invalid joint status response", status: "error" });
        return;
    }

    // ── 2) Pre-allocate arrays (avoid multiple .map() GC churn)
    const jointsIdx = [1, 2, 3, 4, 5, 6];
    const initial = new Array(6);
    const final = new Array(6);
    const deltas = new Array(6);
    const vBase = new Array(6);
    const aBase = new Array(6);

    for (let i = 0; i < 6; i++) {
        initial[i] = Number(statuses[i]?.position) || 0;
        final[i] = Number(poseJoints[i]) || 0;
        deltas[i] = Math.abs(final[i] - initial[i]);

        // clamp non-finite/negative parameters to zero to avoid NaNs downstream
        const vmax = Number(parameters[`joint${i + 1}.maxSpeed`]) || 0;
        const amax = Number(parameters[`joint${i + 1}.maxAccel`]) || 0;
        // conservative: divide by 3 like before
        vBase[i] = Math.max(0, vmax / 3);
        aBase[i] = Math.max(0, amax / 3);
    }

    // ── 3) Early exit if every delta is tiny
    const EPS = 1e-3;
    let maxDelta = 0;
    for (let i = 0; i < 6; i++) if (deltas[i] > maxDelta) maxDelta = deltas[i];
    if (maxDelta <= EPS) {
        // Nothing to do; do not spam the Teensy
        toast({ title: "Already at target", status: "info" });
        return;
    }

    // ── 4) helper: time under trapezoidal profile
    const trapezoidalTime = (delta, vmax, amax) => {
        // guard amax/vmax
        if (amax <= 0 || vmax <= 0) return Infinity;
        const tA = vmax / amax;
        const xA = 0.5 * amax * tA * tA;
        if (delta < 2 * xA) {
            // triangular
            return 2 * Math.sqrt(Math.max(delta, 0) / amax);
        }
        // trapezoidal
        const xC = delta - 2 * xA;
        return 2 * tA + xC / vmax;
    };

    // ── 5) compute syncTime (slowest axis)
    let syncTime = 0.01;
    for (let i = 0; i < 6; i++) {
        const t = trapezoidalTime(deltas[i], vBase[i], aBase[i]);
        if (t > syncTime) syncTime = t;
    }
    if (!isFinite(syncTime) || syncTime <= 0) {
        toast({ title: "Invalid kinematics parameters", description: "Check max speed/accel limits.", status: "error" });
        return;
    }

    // ── 6) Solve per-axis vmax,aSync to fit exactly into syncTime
    const speeds = new Array(6);
    const accels = new Array(6);
    const tAmax = syncTime / 2;

    for (let i = 0; i < 6; i++) {
        const d = deltas[i];
        const amax = aBase[i];
        const vcap = vBase[i];

        let vmax;
        if (amax <= 0) {
            vmax = 0;
        } else {
            const xAmax = 0.5 * amax * tAmax * tAmax;
            if (d < 2 * xAmax) {
                // triangular-case peak
                vmax = Math.sqrt(Math.max(d * amax, 0));
            } else {
                // trapezoidal-case: (amax*syncTime - sqrt(amax^2*syncTime^2 - 4*amax*d))/2
                const disc = amax * amax * syncTime * syncTime - 4 * amax * d;
                vmax = disc < 0 ? amax * tAmax : (amax * syncTime - Math.sqrt(disc)) / 2;
            }
        }

        // cap by base speed and keep non-negative
        vmax = Math.max(0, Math.min(vmax || 0, vcap));

        // aSync derived from tAmax (avoid div0)
        const aSync = tAmax > 0 ? vmax / tAmax : 0;

        speeds[i] = vmax;
        accels[i] = aSync;
    }

    // ── 7) round & clamp (avoid zeros to keep firmware happy)
    const round4 = (v) => Math.round(v * 10000) / 10000;
    const MIN_V = 0.1;
    const MIN_A = 0.1;

    for (let i = 0; i < 6; i++) {
        final[i] = round4(final[i]);
        speeds[i] = round4(Math.max(MIN_V, speeds[i] || 0));
        accels[i] = round4(Math.max(MIN_A, accels[i] || 0));
    }

    // ── 8) Emit single MoveMultiple
    moveMultiple(jointsIdx, final, speeds, accels);
}
