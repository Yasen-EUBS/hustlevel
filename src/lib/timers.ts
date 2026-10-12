import { useSyncExternalStore } from "react";
import { beep, unlockAudio } from "@/lib/titan";

export type TimerType = "rest" | "stopwatch" | "amrap" | "fortime" | "tabata" | "interval" | "emom";

export type TimerConfig = {
  rest: { seconds: number; min: number; max: number };
  stopwatch: Record<string, never>;
  amrap: { minutes: number };
  fortime: { capMinutes: number };
  tabata: { work: number; rest: number; rounds: number };
  interval: { work: number; rest: number; rounds: number; sets: number; setRest: number };
  emom: { minutes: number; interval: number };
};

export const DEFAULTS: TimerConfig = {
  rest: { seconds: 120, min: 120, max: 120 },
  stopwatch: {},
  amrap: { minutes: 12 },
  fortime: { capMinutes: 0 },
  tabata: { work: 20, rest: 10, rounds: 8 },
  interval: { work: 40, rest: 20, rounds: 5, sets: 1, setRest: 60 },
  emom: { minutes: 10, interval: 60 },
};

export const TIMER_LABELS: Record<TimerType, string> = {
  rest: "Rest Timer",
  stopwatch: "Stopwatch",
  amrap: "AMRAP",
  fortime: "For Time",
  tabata: "Tabata",
  interval: "Custom Interval",
  emom: "EMOM",
};

export type Phase = "ready" | "work" | "rest" | "setrest";
export type Segment = { phase: Phase; dur: number; label: string; round?: number; set?: number };

const PREP = 3;

/** Build the timeline of fixed-length segments. Count-up timers return only the prep segment. */
export function buildSegments<T extends TimerType>(type: T, cfg: TimerConfig[T]): Segment[] {
  const segs: Segment[] = type === "rest" ? [] : [{ phase: "ready", dur: PREP, label: "GET READY" }];
  if (type === "rest") {
    const c = cfg as TimerConfig["rest"];
    segs.push({ phase: "rest", dur: c.seconds, label: "REST" });
  } else if (type === "amrap") {
    segs.push({ phase: "work", dur: (cfg as TimerConfig["amrap"]).minutes * 60, label: "AMRAP" });
  } else if (type === "tabata") {
    const c = cfg as TimerConfig["tabata"];
    for (let r = 1; r <= c.rounds; r++) {
      segs.push({ phase: "work", dur: c.work, label: "WORK", round: r });
      if (c.rest > 0 && r < c.rounds) segs.push({ phase: "rest", dur: c.rest, label: "REST", round: r });
    }
  } else if (type === "interval") {
    const c = cfg as TimerConfig["interval"];
    for (let s = 1; s <= c.sets; s++) {
      for (let r = 1; r <= c.rounds; r++) {
        segs.push({ phase: "work", dur: c.work, label: "WORK", round: r, set: s });
        if (c.rest > 0 && r < c.rounds) segs.push({ phase: "rest", dur: c.rest, label: "REST", round: r, set: s });
      }
      if (s < c.sets && c.setRest > 0) segs.push({ phase: "setrest", dur: c.setRest, label: "SET REST", set: s });
    }
  } else if (type === "emom") {
    const c = cfg as TimerConfig["emom"];
    for (let r = 1; r <= c.minutes; r++) segs.push({ phase: "work", dur: c.interval, label: "EMOM", round: r });
  }
  return segs;
}

export const isCountUp = (t: TimerType) => t === "stopwatch" || t === "fortime";

export type TimerState = {
  type: TimerType;
  cfg: TimerConfig[TimerType];
  segments: Segment[];
  startedAt: number | null; // wall-clock ms when (re)started; null while paused
  accumulated: number; // ms elapsed before the current run
  rounds: number;
  laps: number[];
  finished: boolean;
  lastIndex: number;
};

export type Snapshot = {
  elapsed: number; // seconds since start incl. prep
  index: number; // current segment index (segments.length when past fixed timeline)
  segment: Segment | null;
  remaining: number; // seconds left in segment (countdown) or 0
  display: number; // seconds to show
  phase: Phase;
};

export function snapshot(s: TimerState, now: number): Snapshot {
  const elapsedMs = s.accumulated + (s.startedAt != null ? now - s.startedAt : 0);
  const elapsed = elapsedMs / 1000;
  let t = elapsed;
  for (let i = 0; i < s.segments.length; i++) {
    const seg = s.segments[i]!;
    if (t < seg.dur) {
      return { elapsed, index: i, segment: seg, remaining: seg.dur - t, display: Math.ceil(seg.dur - t), phase: seg.phase };
    }
    t -= seg.dur;
  }
  if (isCountUp(s.type)) {
    const cap = s.type === "fortime" ? (s.cfg as TimerConfig["fortime"]).capMinutes * 60 : 0;
    const up = cap > 0 ? Math.min(t, cap) : t;
    return { elapsed, index: s.segments.length, segment: null, remaining: 0, display: Math.floor(up), phase: "work" };
  }
  return { elapsed, index: s.segments.length, segment: null, remaining: 0, display: 0, phase: "work" };
}

// ---------- store ----------
type Store = { timer: TimerState | null; open: boolean; view: TimerType | "grid"; restDefaults: { min: number; max: number } | null };
let store: Store = { timer: null, open: false, view: "grid", restDefaults: null };
const listeners = new Set<() => void>();
let ticker: ReturnType<typeof setInterval> | null = null;
let nowCache = 0;

function emit() {
  listeners.forEach((l) => l());
}
function set(patch: Partial<Store>) {
  store = { ...store, ...patch };
  emit();
}
function setTimer(patch: Partial<TimerState>) {
  if (!store.timer) return;
  set({ timer: { ...store.timer, ...patch } });
}

function tick() {
  nowCache = Date.now();
  const t = store.timer;
  if (!t || !t.startedAt) return;
  const snap = snapshot(t, nowCache);
  if (snap.index !== t.lastIndex) {
    if (snap.index > t.lastIndex) beep();
    t.lastIndex = snap.index;
  }
  const fixedEnd = !isCountUp(t.type) && snap.index >= t.segments.length;
  const capEnd =
    t.type === "fortime" &&
    (t.cfg as TimerConfig["fortime"]).capMinutes > 0 &&
    snap.index >= t.segments.length &&
    snap.display >= (t.cfg as TimerConfig["fortime"]).capMinutes * 60;
  if (fixedEnd || capEnd) {
    if (capEnd) beep();
    finishTimer();
    return;
  }
  emit();
}

function ensureTicker() {
  if (typeof window === "undefined") return;
  if (!ticker) ticker = setInterval(tick, 200);
}
function stopTicker() {
  if (ticker) clearInterval(ticker);
  ticker = null;
}

function finishTimer() {
  const t = store.timer;
  if (!t) return;
  const now = Date.now();
  const acc = t.accumulated + (t.startedAt ? now - t.startedAt : 0);
  stopTicker();
  set({ timer: { ...t, accumulated: acc, startedAt: null, finished: true } });
  if (t.type === "rest") set({ timer: null });
}

export const timers = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  get: () => store,
  openSheet(view: TimerType | "grid" = store.timer ? store.timer.type : "grid") {
    set({ open: true, view });
  },
  closeSheet() {
    set({ open: false });
  },
  setView(view: TimerType | "grid") {
    set({ view });
  },
  setRestDefaults(d: { min: number; max: number } | null) {
    store = { ...store, restDefaults: d };
    emit();
  },
  start<T extends TimerType>(type: T, cfg: TimerConfig[T]) {
    unlockAudio();
    saveConfig(type, cfg);
    const now = Date.now();
    store = {
      ...store,
      view: type,
      timer: { type, cfg, segments: buildSegments(type, cfg), startedAt: now, accumulated: 0, rounds: 0, laps: [], finished: false, lastIndex: 0 },
    };
    emit();
    ensureTicker();
  },
  startRest(min: number, max: number, seconds = min) {
    timers.start("rest", { seconds, min, max });
  },
  pause() {
    const t = store.timer;
    if (!t?.startedAt) return;
    setTimer({ accumulated: t.accumulated + Date.now() - t.startedAt, startedAt: null });
    stopTicker();
  },
  resume() {
    const t = store.timer;
    if (!t || t.startedAt || t.finished) return;
    unlockAudio();
    setTimer({ startedAt: Date.now() });
    ensureTicker();
  },
  reset() {
    const t = store.timer;
    if (!t) return;
    stopTicker();
    setTimer({ startedAt: null, accumulated: 0, rounds: 0, laps: [], finished: false, lastIndex: 0 });
  },
  stop() {
    stopTicker();
    set({ timer: null });
  },
  done() {
    beep();
    finishTimer();
  },
  addRound() {
    const t = store.timer;
    if (t) setTimer({ rounds: t.rounds + 1 });
  },
  lap() {
    const t = store.timer;
    if (!t) return;
    const snap = snapshot(t, Date.now());
    setTimer({ laps: [...t.laps, snap.display] });
  },
  /** Rest timer: shift remaining time by delta seconds. */
  adjustRest(delta: number) {
    const t = store.timer;
    if (!t || t.type !== "rest") return;
    const cfg = t.cfg as TimerConfig["rest"];
    const seconds = Math.max(5, cfg.seconds + delta);
    setTimer({ cfg: { ...cfg, seconds }, segments: buildSegments("rest", { ...cfg, seconds }) });
  },
};

export function useTimers() {
  return useSyncExternalStore(timers.subscribe, timers.get, timers.get);
}

/** Re-render roughly every 200ms while a timer runs; returns current wall time. */
export function useNow() {
  useTimers();
  return nowCache || Date.now();
}

// ---------- remembered settings ----------
const KEY = (t: TimerType) => `nss-timer-${t}`;
export function loadConfig<T extends TimerType>(type: T): TimerConfig[T] {
  try {
    const raw = window.localStorage.getItem(KEY(type));
    if (raw) return { ...DEFAULTS[type], ...JSON.parse(raw) };
  } catch {}
  return DEFAULTS[type];
}
export function saveConfig<T extends TimerType>(type: T, cfg: TimerConfig[T]) {
  try {
    window.localStorage.setItem(KEY(type), JSON.stringify(cfg));
  } catch {}
}

export function fmtClock(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}
