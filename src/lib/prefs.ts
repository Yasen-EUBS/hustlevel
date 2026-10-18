import { useSyncExternalStore } from "react";

// Per-device preference: show progression tips while logging (default on).
const TIPS_KEY = "hl_progression_tips";
const listeners = new Set<() => void>();

function readTips() {
  try {
    return localStorage.getItem(TIPS_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setTipsEnabled(on: boolean) {
  try {
    localStorage.setItem(TIPS_KEY, on ? "on" : "off");
  } catch {
    /* storage blocked: keep the in-memory default */
  }
  listeners.forEach((l) => l());
}

export function useTipsEnabled() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    readTips,
    () => true,
  );
}
