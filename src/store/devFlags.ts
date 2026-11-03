/**
 * Dev-only flags. `bypassGate` lets us reach the Main app without an active
 * subscription/trial (useful while in-app purchases are pending store setup). It is
 * ONLY honored when __DEV__ is true, so production gating remains entitlement-driven
 * (build prompt §6 — never trust client).
 */
import { create } from 'zustand';

interface DevFlagsState {
  bypassGate: boolean;
  setBypassGate: (value: boolean) => void;
}

export const useDevFlags = create<DevFlagsState>((set) => ({
  bypassGate: false,
  setBypassGate: (value) => set({ bypassGate: value }),
}));

export const IS_DEV = typeof __DEV__ !== 'undefined' && __DEV__;
