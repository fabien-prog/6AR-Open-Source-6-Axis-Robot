// utils/store.ts
import { create } from 'zustand';

// Create once
const _store = create(set => ({
  angles: [0,0,0,0,0,0],
  setAngles: (a) =>
    set({ angles: Array.isArray(a) && a.length === 6 ? [...a] : [0,0,0,0,0,0] }),
}));

// Hook facade
export const useJointStore = _store;

// Also export the instance for debugging / imperative use
export const jointStore = _store;
