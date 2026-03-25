import { create } from "zustand";

export type JointAngles6 = [number, number, number, number, number, number];

const ZERO: JointAngles6 = [0, 0, 0, 0, 0, 0];

/**
 * FAST angles used by the 3D renderer.
 * Mutated in-place so it does NOT cause React rerenders.
 * Units: degrees
 */
export const jointAnglesRef = {
  current: new Float32Array(ZERO),
};

type JointStoreState = {
  // UI angles (slow updates)
  anglesUi: JointAngles6;
  setAnglesUi: (a: number[]) => void;

  // optional legacy for old code
  angles: JointAngles6;
  setAngles: (a: number[]) => void;

  // fast angles for renderer
  setAnglesFast: (a: number[]) => void;

  resetAngles: () => void;

  // Shared selected joint (1-6) across all physical control widgets
  selectedJoint: number;
  setSelectedJoint: (j: number) => void;
};

export const useJointStore = create<JointStoreState>((set, get) => ({
  anglesUi: [...ZERO],
  angles: [...ZERO],

  setAnglesUi: (a) =>
    set({
      anglesUi: (Array.isArray(a) && a.length === 6 ? [...a] : [...ZERO]) as JointAngles6,
    }),

  setAnglesFast: (a) => {
    if (!Array.isArray(a) || a.length !== 6) {
      jointAnglesRef.current.set(ZERO);
      return;
    }
    for (let i = 0; i < 6; i++) jointAnglesRef.current[i] = +a[i] || 0;
  },

  // legacy API: keep both UI + fast synced
  setAngles: (a) => {
    const arr = (Array.isArray(a) && a.length === 6 ? a : ZERO) as number[];
    get().setAnglesFast(arr);
    get().setAnglesUi(arr);
    set({ angles: [...arr] as JointAngles6 });
  },

  resetAngles: () => {
    jointAnglesRef.current.set(ZERO);
    set({ anglesUi: [...ZERO], angles: [...ZERO] });
  },

  selectedJoint: 1,
  setSelectedJoint: (j) => set({ selectedJoint: j }),
}));
