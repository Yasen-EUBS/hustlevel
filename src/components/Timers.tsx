import { useEffect, useState } from "react";
import { AlarmClock, ChevronLeft, Flag, Hourglass, Minus, Pause, Play, Plus, Repeat, RotateCcw, SlidersHorizontal, Timer, X, Zap } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  DEFAULTS,
  TIMER_LABELS,
  fmtClock,
  isCountUp,
  loadConfig,
  snapshot,
  timers,
  useNow,
  useTimers,
  type TimerConfig,
  type TimerType,
} from "@/lib/timers";

const ICONS: Record<TimerType, typeof Timer> = {
  rest: Hourglass,
  stopwatch: Timer,
  amrap: Repeat,
  fortime: Flag,
  tabata: Zap,
  interval: SlidersHorizontal,
  emom: AlarmClock,
};
const ORDER: TimerType[] = ["rest", "stopwatch", "amrap", "fortime", "tabata", "interval", "emom"];

function phaseColor(phase: string) {
  if (phase === "ready") return "text-chart-3";
  if (phase === "rest" || phase === "setrest") return "text-primary";
  return "text-success";
}

/** Compact running timer for bottom bars. Renders nothing when idle. */
export function MiniTimer({ className = "" }: { className?: string }) {
  const { timer } = useTimers();
  const now = useNow();
  if (!timer) return null;
  const snap = snapshot(timer, now);
  const Icon = ICONS[timer.type];
  return (
    <button
      onClick={() => timers.openSheet(timer.type)}
      aria-label={`Open ${TIMER_LABELS[timer.type]}`}
      className={`flex h-12 items-center gap-2 rounded-full bg-primary px-4 text-lg font-bold tabular-nums text-primary-foreground active:scale-95 ${className}`}
    >
      <Icon className="h-5 w-5" />
      {fmtClock(snap.display)}
      <span className="text-[10px] font-semibold uppercase opacity-80">
        {timer.finished ? "DONE" : !timer.startedAt ? "PAUSED" : snap.segment?.label ?? (isCountUp(timer.type) ? "" : "")}
      </span>
    </button>
  );
}

export function SelectTimerButton() {
  const { timer } = useTimers();
  if (timer) return <MiniTimer />;
  return (
    <button onClick={() => timers.openSheet("grid")} className="flex h-12 items-center gap-2 rounded-full bg-card px-4 text-sm font-bold active:scale-95">
      <Timer className="h-5 w-5 text-primary" /> Select Timer
    </button>
  );
}

export function TimerSheet() {
  const { open, view, timer } = useTimers();
  return (
    <Sheet open={open} onOpenChange={(o) => (o ? timers.openSheet() : timers.closeSheet())}>
      <SheetContent
        side="bottom"
        aria-describedby={undefined}
        className="max-h-[92dvh] overflow-y-auto rounded-t-3xl px-5 pt-5 pb-safe"
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
      >
        {view === "grid" ? (
          <>
            <SheetTitle className="mb-4 font-display text-2xl font-extrabold uppercase">Select Timer</SheetTitle>
            <div className="grid grid-cols-2 gap-3 pb-6">
              {ORDER.map((t) => {
                const Icon = ICONS[t];
                return (
                  <button key={t} onClick={() => timers.setView(t)} className="flex h-28 flex-col items-center justify-center gap-2 rounded-2xl bg-card font-bold active:scale-[0.97] active:bg-accent">
                    <Icon className="h-9 w-9 text-primary" />
                    {TIMER_LABELS[t]}
                  </button>
                );
              })}
            </div>
          </>
        ) : timer && timer.type === view ? (
          <RunningView />
        ) : (
          <ConfigView type={view} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function Header({ type, onBack }: { type: TimerType; onBack?: () => void }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      {onBack && (
        <button aria-label="Back to timers" onClick={onBack} className="-ml-2 p-2">
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}
      <SheetTitle className="font-display text-2xl font-extrabold uppercase">{TIMER_LABELS[type]}</SheetTitle>
    </div>
  );
}

function Stepper({ label, value, onChange, step = 1, min = 0, max = 999, fmt }: { label: string; value: number; onChange: (n: number) => void; step?: number; min?: number; max?: number; fmt?: (n: number) => string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-card px-4 py-3">
      <span className="text-sm font-bold tracking-wide text-muted-foreground">{label}</span>
      <div className="flex items-center gap-3">
        <button aria-label={`Decrease ${label}`} onClick={() => onChange(Math.max(min, value - step))} className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary">
          <Minus className="h-5 w-5" />
        </button>
        <span className="w-16 text-center text-xl font-bold tabular-nums">{fmt ? fmt(value) : value}</span>
        <button aria-label={`Increase ${label}`} onClick={() => onChange(Math.min(max, value + step))} className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary">
          <Plus className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

function ConfigView({ type }: { type: TimerType }) {
  const { restDefaults } = useTimers();
  const [cfg, setCfg] = useState<any>(DEFAULTS[type]);
  useEffect(() => {
    const saved: any = loadConfig(type);
    if (type === "rest" && restDefaults) setCfg({ seconds: restDefaults.min, min: restDefaults.min, max: restDefaults.max });
    else setCfg(saved);
  }, [type, restDefaults]);
  const up = (patch: object) => setCfg((c: object) => ({ ...c, ...patch }));
  const secs = (n: number) => fmtClock(n);

  return (
    <div className="space-y-3 pb-6">
      <Header type={type} onBack={() => timers.setView("grid")} />
      {type === "rest" && (
        <>
          <Stepper label="REST" value={cfg.seconds} step={15} min={5} max={1800} fmt={secs} onChange={(seconds) => up({ seconds })} />
          <div className="flex gap-2">
            {[...new Set([cfg.min, cfg.max])].map((s: number) => (
              <button key={s} onClick={() => up({ seconds: s })} className={`h-11 flex-1 rounded-full font-bold ${cfg.seconds === s ? "bg-primary text-primary-foreground" : "bg-card"}`}>
                {fmtClock(s)}
              </button>
            ))}
          </div>
        </>
      )}
      {type === "stopwatch" && <p className="text-sm text-muted-foreground">Counts up from zero. Use Lap to record splits.</p>}
      {type === "amrap" && <Stepper label="MINUTES" value={cfg.minutes} min={1} max={120} onChange={(minutes) => up({ minutes })} />}
      {type === "fortime" && (
        <Stepper label="TIME CAP (MIN)" value={cfg.capMinutes} min={0} max={120} fmt={(n) => (n ? String(n) : "None")} onChange={(capMinutes) => up({ capMinutes })} />
      )}
      {(type === "tabata" || type === "interval") && (
        <>
          <Stepper label="WORK" value={cfg.work} step={5} min={5} max={3600} fmt={secs} onChange={(work) => up({ work })} />
          <Stepper label="REST" value={cfg.rest} step={5} min={0} max={3600} fmt={secs} onChange={(rest) => up({ rest })} />
          <Stepper label="ROUNDS" value={cfg.rounds} min={1} max={99} onChange={(rounds) => up({ rounds })} />
        </>
      )}
      {type === "interval" && (
        <>
          <Stepper label="SETS" value={cfg.sets} min={1} max={20} onChange={(sets) => up({ sets })} />
          {cfg.sets > 1 && <Stepper label="REST BETWEEN SETS" value={cfg.setRest} step={15} min={0} max={3600} fmt={secs} onChange={(setRest) => up({ setRest })} />}
        </>
      )}
      {type === "emom" && (
        <>
          <Stepper label="MINUTES" value={cfg.minutes} min={1} max={120} onChange={(minutes) => up({ minutes })} />
          <Stepper label="INTERVAL" value={cfg.interval} step={15} min={15} max={600} fmt={secs} onChange={(interval) => up({ interval })} />
        </>
      )}
      <button onClick={() => timers.start(type, cfg as TimerConfig[typeof type])} className="mt-2 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-success text-lg font-bold text-success-foreground active:scale-[0.98]">
        <Play className="h-5 w-5" fill="currentColor" /> Start
      </button>
    </div>
  );
}

function RunningView() {
  const { timer } = useTimers();
  const now = useNow();
  if (!timer) return null;
  const snap = snapshot(timer, now);
  const running = !!timer.startedAt;
  const seg = snap.segment;
  const label = timer.finished ? "DONE" : seg?.label ?? (timer.type === "stopwatch" ? "STOPWATCH" : "GO");
  const color = timer.finished ? "text-success" : phaseColor(seg?.phase ?? "work");
  const cfg: any = timer.cfg;
  let sub = "";
  if (seg?.round && timer.type === "tabata") sub = `Round ${seg.round} / ${cfg.rounds}`;
  if (seg?.round && timer.type === "interval") sub = `${cfg.sets > 1 ? `Set ${seg.set}/${cfg.sets} · ` : ""}Round ${seg.round}/${cfg.rounds}`;
  if (seg?.phase === "setrest") sub = `After set ${seg.set} / ${cfg.sets}`;
  if (seg?.round && timer.type === "emom") sub = `Minute ${seg.round} / ${cfg.minutes}`;
  if (timer.type === "fortime" && cfg.capMinutes) sub = `Cap ${cfg.capMinutes}:00`;

  return (
    <div className="pb-6">
      <Header type={timer.type} onBack={() => timers.setView("grid")} />
      <div className="flex flex-col items-center rounded-3xl bg-card py-8">
        <div className={`text-sm font-extrabold tracking-[0.3em] ${color}`}>{label}</div>
        <div className={`font-display text-[5.5rem] font-extrabold leading-none tabular-nums ${seg?.phase === "ready" ? "text-chart-3" : ""}`} aria-live="off">
          {fmtClock(snap.display)}
        </div>
        {sub && <div className="mt-2 text-base font-semibold text-muted-foreground">{sub}</div>}
        {timer.type === "amrap" && <div className="mt-2 text-lg font-bold">Rounds: <span className="text-success">{timer.rounds}</span></div>}
      </div>

      {timer.type === "rest" && !timer.finished && (
        <div className="mt-3 flex gap-2">
          <button onClick={() => timers.adjustRest(-15)} className="h-12 flex-1 rounded-full bg-card font-bold">−15s</button>
          {[...new Set([cfg.min, cfg.max])].map((s: number) => (
            <button key={s} onClick={() => timers.startRest(cfg.min, cfg.max, s)} className={`h-12 flex-1 rounded-full font-bold ${cfg.seconds === s ? "bg-primary text-primary-foreground" : "bg-card"}`}>
              {fmtClock(s)}
            </button>
          ))}
          <button onClick={() => timers.adjustRest(15)} className="h-12 flex-1 rounded-full bg-card font-bold">+15s</button>
        </div>
      )}

      {timer.type === "amrap" && !timer.finished && (
        <button onClick={() => timers.addRound()} className="mt-3 h-20 w-full rounded-2xl bg-success text-2xl font-extrabold text-success-foreground active:scale-[0.98]">
          +1 Round
        </button>
      )}

      <div className="mt-3 flex gap-2">
        {!timer.finished && (
          <button onClick={() => (running ? timers.pause() : timers.resume())} className="flex h-14 flex-1 items-center justify-center gap-2 rounded-full bg-primary font-bold text-primary-foreground">
            {running ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
            {running ? "Pause" : "Resume"}
          </button>
        )}
        {timer.type === "stopwatch" && running && (
          <button onClick={() => timers.lap()} className="h-14 flex-1 rounded-full bg-card font-bold">Lap</button>
        )}
        {timer.type === "fortime" && !timer.finished && (
          <button onClick={() => timers.done()} className="h-14 flex-1 rounded-full bg-success font-bold text-success-foreground">Done</button>
        )}
        <button aria-label="Reset timer" onClick={() => (timer.finished ? timers.start(timer.type, timer.cfg as never) : timers.reset())} className="flex h-14 items-center justify-center gap-2 rounded-full bg-card px-5 font-bold">
          <RotateCcw className="h-5 w-5" /> {timer.finished ? "Again" : "Reset"}
        </button>
        <button aria-label="Close timer" onClick={() => { timers.stop(); timers.setView("grid"); }} className="flex h-14 w-14 items-center justify-center rounded-full bg-card">
          <X className="h-5 w-5" />
        </button>
      </div>

      {timer.laps.length > 0 && (
        <ol className="mt-4 divide-y divide-border rounded-2xl bg-card">
          {timer.laps.map((l, i) => (
            <li key={i} className="flex justify-between px-4 py-2.5 tabular-nums">
              <span className="text-muted-foreground">Lap {i + 1}</span>
              <span className="font-bold">{fmtClock(l - (timer.laps[i - 1] ?? 0))}</span>
              <span className="text-muted-foreground">{fmtClock(l)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
