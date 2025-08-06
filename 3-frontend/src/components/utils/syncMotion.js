// src/components/utils/syncMotion.js

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
 * @param {(opts:{title:string,status:string})=>void} [toast] — optional notifier for errors
 */
export async function movePhysicalToVirtual({
    getAllJointStatus,
    poseJoints,
    parameters,
    moveMultiple,
    toast = () => { },
}) {
    // 1) grab current positions
    let statuses;
    try {
        statuses = await getAllJointStatus();
    } catch (e) {
        toast({ title: "Failed to query joint status", status: "error" });
        return;
    }
    if (!Array.isArray(statuses) || statuses.length !== 6) {
        toast({ title: "Invalid joint status response", status: "error" });
        return;
    }

    // 2) compute deltas
    const initialPositions = statuses.map((j) => j.position);
    const finalPositions = poseJoints.slice(0, 6);
    const jointsIdx = [1, 2, 3, 4, 5, 6];
    const deltas = jointsIdx.map((_, i) => Math.abs(finalPositions[i] - initialPositions[i]));

    // 3) base speeds / accels (divide by 3 to be conservative)
    const baseSpeeds = jointsIdx.map(j => (parameters[`joint${j}.maxSpeed`] ?? 0) / 3);
    const baseAccels = jointsIdx.map(j => (parameters[`joint${j}.maxAccel`] ?? 0) / 3);

    // 4) helper: time to move `delta` under trapezoidal profile
    const trapezoidalTime = (delta, vmax, amax) => {
        const tA = vmax / amax;
        const xA = 0.5 * amax * tA * tA;
        if (delta < 2 * xA) {
            // triangular profile
            return 2 * Math.sqrt(delta / amax);
        }
        // trapezoidal: accel, cruise, decel
        const xC = delta - 2 * xA;
        return 2 * tA + xC / vmax;
    };

    // 5) figure out the slowest axis → syncTime
    const travelTimes = deltas.map((d, i) => trapezoidalTime(d, baseSpeeds[i], baseAccels[i]));
    const syncTime = Math.max(...travelTimes, 0.01);

    // 6) build each axis’s vmax and aSync so it fits exactly into syncTime
    const syncProfiles = deltas.map((d, i) => {
        const amax = baseAccels[i];
        const tAmax = syncTime / 2;
        const xAmax = 0.5 * amax * tAmax * tAmax;
        let vmax;

        if (d < 2 * xAmax) {
            // triangular-case peak
            vmax = Math.sqrt(d * amax);
        } else {
            // trapezoidal-case: solve quadratic
            const disc = amax * amax * syncTime * syncTime - 4 * amax * d;
            vmax = disc < 0
                ? amax * tAmax
                : (amax * syncTime - Math.sqrt(disc)) / 2;
        }

        vmax = Math.min(vmax, baseSpeeds[i]);
        const aSync = vmax / tAmax;
        return { vmax, aSync };
    });

    // 7) round values for JSON… avoid zeros
    const round4 = (v) => Math.round(v * 10000) / 10000;
    const targets = finalPositions.map(round4);
    const speeds = syncProfiles.map(p => round4(Math.max(0.1, p.vmax)));
    const accels = syncProfiles.map(p => round4(Math.max(0.1, p.aSync)));

    // 8) send it off
    moveMultiple(jointsIdx, targets, speeds, accels);
}
