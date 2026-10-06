import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Minus, Pause, Play, Plus, Timer, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Friends } from "@/components/Friends";
import {
  beep,
  epley,
  fetchActiveProgram,
  fmtDuration,

  fmtRest,
  formatLast,
  normKey,
  toISO,
  unlockAudio,
  type ProgramExercise,
} from "@/lib/titan";

export const Route = createFileRoute("/_authenticated/session/$dayId")({
  validateSearch: z.object({ date: z.string().optional(), ex: z.number().int().optional() }),
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Session — NSS" },
      { name: "description", content: "Log your sets, reps and weights." },
      { property: "og:title", content: "Session — NSS" },
      { property: "og:description", content: "Log your sets, reps and weights." },
    ],
  }),
  component: SessionPage,
});

type Row = { reps: string; kg: string; done: boolean };
type HistSet = { exercise_key: string; reps: number | null; weight_kg: number | null; set_number: number; session_id: string; date: string; started: string };

function SessionPage() {
  const { dayId } = Route.useParams();
  const { date: dateParam, ex: exParam } = Route.useSearch();
  const { user } = Route.useRouteContext();
  const date = dateParam ?? toISO(new Date());
  const navigate = useNavigate();
  const qc = useQueryClient();

  const program = useQuery({ queryKey: ["program"], queryFn: fetchActiveProgram });
  const day = program.data?.program_days.find((d) => d.id === dayId);
  const exercises = (day?.program_exercises ?? []) as ProgramExercise[];
  const keys = useMemo(() => exercises.map((e) => normKey(e.name)), [exercises]);

  const session = useQuery({
    queryKey: ["session", dayId, date],
    enabled: !!day,
    staleTime: Infinity,
    queryFn: async () => {
      const { data: existing } = await supabase
        .from("workout_sessions")
        .select("*")
        .eq("user_id", user.id)
        .eq("program_day_id", dayId)
        .eq("session_date", date)
        .maybeSingle();
      if (existing) return existing;
      const { data, error } = await supabase
        .from("workout_sessions")
        .insert({ program_day_id: dayId, session_date: date, day_title: day!.title })
        .select()
        .single();
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["sessions"] });
      return data;
    },
  });
  const sessionId = session.data?.id;

  const logs = useQuery({
    queryKey: ["session-logs", sessionId],
    enabled: !!sessionId,
    staleTime: Infinity,
    queryFn: async () => {
      const [s, n] = await Promise.all([
        supabase.from("set_logs").select("*").eq("session_id", sessionId!),
        supabase.from("exercise_notes").select("*").eq("session_id", sessionId!),
      ]);
      if (s.error) throw s.error;
      return { sets: s.data, notes: n.data ?? [] };
    },
  });

  const history = useQuery({
    queryKey: ["history-for", keys.join("|"), sessionId],
    enabled: !!sessionId && keys.length > 0,
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("set_logs")
        .select("exercise_key, reps, weight_kg, set_number, session_id, completed, workout_sessions!inner(session_date, started_at)")
        .in("exercise_key", keys)
        .eq("user_id", user.id)
        .neq("session_id", sessionId!)
        .eq("completed", true);
      if (error) throw error;
      return data.map((d) => ({
        exercise_key: d.exercise_key,
        reps: d.reps,
        weight_kg: d.weight_kg == null ? null : Number(d.weight_kg),
        set_number: d.set_number,
        session_id: d.session_id,
        date: d.workout_sessions.session_date,
        started: d.workout_sessions.started_at,
      })) as HistSet[];
    },
  });

  const stats = useMemo(() => {
    const out: Record<string, { max: number; last: HistSet[] }> = {};
    for (const k of keys) {
      const hs = (history.data ?? []).filter((h) => h.exercise_key === k && h.reps != null);
      const max = Math.max(0, ...hs.map((h) => epley(Number(h.weight_kg ?? 0), h.reps ?? 0)));
      const latest = hs.reduce<HistSet | null>((a, h) => (!a || h.date > a.date || (h.date === a.date && h.started > a.started) ? h : a), null);
      const last = latest ? hs.filter((h) => h.session_id === latest.session_id).sort((a, b) => a.set_number - b.set_number) : [];
      out[k] = { max, last };
    }
    return out;
  }, [history.data, keys]);

  const [rows, setRows] = useState<Record<string, Row[]> | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const persisted = useRef<Record<string, Set<number>>>({});

  useEffect(() => {
    if (rows || !logs.data || !history.data) return;
    const init: Record<string, Row[]> = {};
    exercises.forEach((e) => {
      const k = normKey(e.name);
      const mine = logs.data.sets.filter((s) => s.exercise_key === k).sort((a, b) => a.set_number - b.set_number);
      persisted.current[k] = new Set(mine.map((m) => m.set_number));
      const last = stats[k]?.last ?? [];
      const count = Math.max(e.duration_seconds ? 1 : e.sets, mine.length ? mine[mine.length - 1]!.set_number : 0);
      init[k] = Array.from({ length: count }, (_, i) => {
        const m = mine.find((x) => x.set_number === i + 1);
        if (m) return { reps: m.reps?.toString() ?? "", kg: m.weight_kg?.toString() ?? "", done: m.completed };
        const prev = last[i] ?? last[last.length - 1];
        return { reps: "", kg: prev?.weight_kg != null ? String(prev.weight_kg) : "", done: false };
      });
    });
    setRows(init);
    setNotes(Object.fromEntries(logs.data.notes.map((n) => [n.exercise_key, n.note])));
  }, [logs.data, history.data, rows, exercises, stats]);

  const [idx, setIdx] = useState(exParam ?? 0);
  const total = exercises.length;

  // Rest timer
  const [rest, setRest] = useState<{ start: number; min: number; max: number; useMax: boolean } | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const restRemaining = rest ? Math.ceil((rest.start + (rest.useMax ? rest.max : rest.min) * 1000 - now) / 1000) : 0;
  useEffect(() => {
    if (rest && restRemaining <= 0) {
      beep();
      setRest(null);
    }
    return undefined;
  }, [rest, restRemaining]);

  async function persist(e: ProgramExercise, i: number, row: Row) {
    if (!sessionId) return;
    const k = normKey(e.name);
    const { error } = await supabase.from("set_logs").upsert(
      {
        session_id: sessionId,
        exercise_name: e.name,
        exercise_key: k,
        set_number: i + 1,
        reps: row.reps === "" ? null : parseInt(row.reps, 10),
        weight_kg: row.kg === "" ? null : parseFloat(row.kg.replace(",", ".")),
        completed: row.done,
      },
      { onConflict: "session_id,exercise_key,set_number" },
    );
    if (error) toast.error("Couldn't save set: " + error.message);
    else (persisted.current[k] ??= new Set()).add(i + 1);
  }

  function updateRow(e: ProgramExercise, i: number, patch: Partial<Row>) {
    const k = normKey(e.name);
    setRows((r) => {
      if (!r) return r;
      const list = [...(r[k] ?? [])];
      list[i] = { ...list[i]!, ...patch };
      return { ...r, [k]: list };
    });
  }

  function toggleSet(e: ProgramExercise, i: number) {
    unlockAudio();
    const k = normKey(e.name);
    const row = (rows![k] ?? [])[i]!;
    let next = { ...row, done: !row.done };
    if (next.done && !e.duration_seconds && next.reps === "") next.reps = String(e.rep_min ?? "");
    updateRow(e, i, next);
    persist(e, i, next);
    if (next.done && !e.duration_seconds) setRest({ start: Date.now(), min: e.rest_min_seconds, max: e.rest_max_seconds, useMax: false });
  }

  async function addSet(e: ProgramExercise) {
    const k = normKey(e.name);
    setRows((r) => {
      if (!r) return r;
      const list = r[k] ?? [];
      const last = list[list.length - 1];
      return { ...r, [k]: [...list, { reps: "", kg: last?.kg ?? "", done: false }] };
    });
  }
  async function removeSet(e: ProgramExercise) {
    const k = normKey(e.name);
    const list = (rows![k] ?? []);
    if (list.length <= 1) return;
    const n = list.length;
    setRows((r) => (r ? { ...r, [k]: (r[k] ?? []).slice(0, -1) } : r));
    if (persisted.current[k]?.has(n) && sessionId) {
      await supabase.from("set_logs").delete().eq("session_id", sessionId).eq("exercise_key", k).eq("set_number", n);
      persisted.current[k].delete(n);
    }
  }

  async function saveNote(e: ProgramExercise) {
    if (!sessionId) return;
    const k = normKey(e.name);
    await supabase.from("exercise_notes").upsert({ session_id: sessionId, exercise_key: k, note: notes[k] ?? "" }, { onConflict: "session_id,exercise_key" });
  }

  const totals = useMemo(() => {
    let reps = 0,
      vol = 0;
    if (rows)
      Object.values(rows).forEach((list) =>
        list.forEach((r) => {
          if (!r.done) return;
          const rp = parseInt(r.reps, 10) || 0;
          reps += rp;
          vol += rp * (parseFloat(r.kg.replace(",", ".")) || 0);
        }),
      );
    return { reps, vol: Math.round(vol) };
  }, [rows]);

  const prs = useMemo(() => {
    if (!rows) return [];
    return exercises.flatMap((e) => {
      const k = normKey(e.name);
      const best = Math.max(0, ...(rows[k] ?? []).filter((r) => r.done).map((r) => epley(parseFloat(r.kg) || 0, parseInt(r.reps, 10) || 0)));
      const prev = stats[k]?.max ?? 0;
      return best > prev && best > 0 ? [{ name: e.name, best, prev }] : [];
    });
  }, [rows, exercises, stats]);

  const [finishing, setFinishing] = useState(false);
  async function finish() {
    if (!sessionId) return;
    setFinishing(true);
    const { error } = await supabase.from("workout_sessions").update({ completed_at: new Date().toISOString() }).eq("id", sessionId);
    setFinishing(false);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries();
    toast.success("Session saved");
    navigate({ to: "/history/$sessionId", params: { sessionId } });
  }

  const touchX = useRef<number | null>(null);
  const go = (d: number) => setIdx((i) => Math.min(total, Math.max(0, i + d)));

  if (program.isLoading || !rows) {
    return <div className="flex min-h-[100dvh] items-center justify-center text-muted-foreground">{program.data && !day ? "Day not found" : "Loading session…"}</div>;
  }

  const ex = exercises[idx];
  const k = ex ? normKey(ex.name) : "";
  const st = ex ? stats[k] : null;
  const currentBest = ex ? Math.max(0, ...(rows![k] ?? []).filter((r) => r.done).map((r) => epley(parseFloat(r.kg) || 0, parseInt(r.reps, 10) || 0))) : 0;
  const workingMax = Math.max(st?.max ?? 0, currentBest);
  const range = ex ? (ex.rep_max && ex.rep_max !== ex.rep_min ? `${ex.rep_min}-${ex.rep_max}` : `${ex.rep_min ?? ""}`) : "";

  return (
    <div
      className="mx-auto flex min-h-[100dvh] max-w-lg flex-col pt-safe"
      onTouchStart={(e) => (touchX.current = e.touches[0]!.clientX)}
      onTouchEnd={(e) => {
        if (touchX.current == null) return;
        const target = e.target as HTMLElement;
        if (target.closest("input,textarea")) return;
        const dx = e.changedTouches[0]!.clientX - touchX.current;
        if (Math.abs(dx) > 70) go(dx < 0 ? 1 : -1);
        touchX.current = null;
      }}
    >
      <header className="flex items-center gap-3 px-4 py-2">
        <button aria-label="Close session" onClick={() => navigate({ to: "/training", search: { date } })} className="-ml-2 p-2">
          <ChevronDown className="h-7 w-7" />
        </button>
        <div className="flex flex-1 items-center justify-center gap-1.5">
          {exercises.map((e, i) => {
            const done = (rows![normKey(e.name)] ?? []).every((r) => r.done);
            return (
              <button
                key={e.id}
                aria-label={e.name}
                onClick={() => setIdx(i)}
                className={`rounded-full transition-all ${i === idx ? "h-3 w-3" : "h-2 w-2"} ${done ? "bg-success" : i === idx ? "bg-primary" : "bg-muted-foreground/40"}`}
              />
            );
          })}
        </div>
        <div className="text-right text-[11px] font-bold leading-tight text-muted-foreground">
          <div>
            <span className="text-foreground">{totals.reps}</span> REPS
          </div>
          <div>
            <span className="text-foreground">{totals.vol}</span> KG
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-5 pb-36">
        {ex ? (
          <>
            <div className="pt-3 text-sm font-semibold text-primary">
              {ex.letter}. {ex.section === "RECOVERY" ? "Recovery" : "Strength/Power"}
            </div>
            <h1 className="font-display text-3xl font-extrabold uppercase leading-tight">{ex.name}</h1>

            {!ex.duration_seconds && (
              <div className="mt-4 grid grid-cols-2 divide-x divide-border rounded-2xl bg-card py-4 text-center">
                <div>
                  <div className="text-[11px] font-bold tracking-widest text-muted-foreground">WORKING MAX</div>
                  <div className="mt-1 text-2xl font-bold">{workingMax ? `${workingMax} kg` : "—"}</div>
                </div>
                <div className="px-2">
                  <div className="text-[11px] font-bold tracking-widest text-muted-foreground">LAST</div>
                  <div className="mt-1 text-base font-bold leading-snug">{formatLast(st?.last ?? [])}</div>
                </div>
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm">
              {ex.duration_seconds ? (
                <span>
                  <span className="text-muted-foreground">Duration </span>
                  <b>{fmtDuration(ex.duration_seconds)}</b>
                </span>
              ) : (
                <>
                  <span>
                    <span className="text-muted-foreground">Reps </span>
                    <b>
                      {ex.sets}x{range}
                    </b>
                  </span>
                  {ex.tempo && (
                    <span>
                      <span className="text-muted-foreground">Tempo </span>
                      <b>{ex.tempo}</b>
                    </span>
                  )}
                  <span>
                    <span className="text-muted-foreground">Rest </span>
                    <b>{fmtRest(ex.rest_min_seconds, ex.rest_max_seconds)}</b>
                  </span>
                </>
              )}
            </div>
            {!ex.duration_seconds && <Friends exerciseKey={k} me={user.id} />}
            {ex.note && <p className="mt-3 rounded-xl bg-accent px-4 py-3 text-sm">{ex.note}</p>}

            {ex.duration_seconds ? (
              <CardioBlock
                seconds={ex.duration_seconds}
                done={(rows![k] ?? [])[0]?.done ?? false}
                onToggle={() => toggleSet(ex, 0)}
              />
            ) : (
              <>
                <div className="mt-5 grid grid-cols-[3rem_1fr_1fr_3.5rem] gap-2 px-1 text-xs font-bold tracking-widest text-muted-foreground">
                  <div>SETS</div>
                  <div className="text-center">REPS</div>
                  <div className="text-center">KG</div>
                  <div />
                </div>
                <div className="mt-2 space-y-2">
                  {(rows![k] ?? []).map((r, i) => (
                    <div key={i} className="grid grid-cols-[3rem_1fr_1fr_3.5rem] items-center gap-2">
                      <div className="pl-2 text-lg font-bold">{i + 1}</div>
                      <input
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder={range}
                        value={r.reps}
                        onChange={(e) => updateRow(ex, i, { reps: e.target.value.replace(/[^0-9]/g, "") })}
                        onBlur={() => r.done && persist(ex, i, (rows![k] ?? [])[i]!)}
                        className="h-14 w-full rounded-xl bg-card text-center text-lg font-bold outline-none ring-primary placeholder:font-medium placeholder:text-muted-foreground focus:ring-2"
                      />
                      <input
                        inputMode="decimal"
                        placeholder="kg"
                        value={r.kg}
                        onChange={(e) => updateRow(ex, i, { kg: e.target.value.replace(/[^0-9.,]/g, "") })}
                        onBlur={() => r.done && persist(ex, i, (rows![k] ?? [])[i]!)}
                        className="h-14 w-full rounded-xl bg-card text-center text-lg font-bold outline-none ring-primary placeholder:font-medium placeholder:text-muted-foreground focus:ring-2"
                      />
                      <button
                        aria-label={`Complete set ${i + 1}`}
                        onClick={() => toggleSet(ex, i)}
                        className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full border-[3px] transition ${r.done ? "border-success bg-success text-success-foreground" : "border-success/50"}`}
                      >
                        {r.done && <Check className="h-6 w-6" strokeWidth={3} />}
                      </button>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-center gap-4">
                  <button aria-label="Remove set" onClick={() => removeSet(ex)} className="flex h-11 w-11 items-center justify-center rounded-full bg-card">
                    <Minus className="h-5 w-5" />
                  </button>
                  <span className="text-sm font-bold text-muted-foreground">SET</span>
                  <button aria-label="Add set" onClick={() => addSet(ex)} className="flex h-11 w-11 items-center justify-center rounded-full bg-card">
                    <Plus className="h-5 w-5" />
                  </button>
                </div>
              </>
            )}

            <textarea
              placeholder="Add exercise note"
              value={notes[k] ?? ""}
              onChange={(e) => setNotes((n) => ({ ...n, [k]: e.target.value }))}
              onBlur={() => saveNote(ex)}
              rows={2}
              className="mt-6 w-full resize-none rounded-xl bg-card px-4 py-3 outline-none ring-primary placeholder:text-muted-foreground focus:ring-2"
            />
          </>
        ) : (
          <div className="pt-6">
            <h1 className="font-display text-4xl font-extrabold uppercase">Finish Session</h1>
            <p className="text-muted-foreground">{day?.title}</p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-card p-4">
                <div className="text-[11px] font-bold tracking-widest text-muted-foreground">TOTAL REPS</div>
                <div className="mt-1 text-3xl font-bold">{totals.reps}</div>
              </div>
              <div className="rounded-2xl bg-card p-4">
                <div className="text-[11px] font-bold tracking-widest text-muted-foreground">VOLUME</div>
                <div className="mt-1 text-3xl font-bold">{totals.vol} kg</div>
              </div>
            </div>
            {prs.length > 0 && (
              <div className="mt-6">
                <div className="mb-2 text-xs font-bold tracking-widest text-muted-foreground">NEW WORKING MAX</div>
                <ul className="space-y-2">
                  {prs.map((p) => (
                    <li key={p.name} className="flex items-center gap-3 rounded-xl bg-card p-4">
                      <Trophy className="h-5 w-5 text-chart-3" />
                      <span className="flex-1 font-semibold">{p.name}</span>
                      <span className="font-bold text-success">{p.best} kg</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <button
              disabled={finishing}
              onClick={finish}
              className="mt-8 h-14 w-full rounded-full bg-success text-lg font-bold text-success-foreground disabled:opacity-60"
            >
              {finishing ? "Saving…" : "Finish & Save"}
            </button>
          </div>
        )}
      </main>

      <footer className="fixed inset-x-0 bottom-0 border-t bg-background/95 backdrop-blur pb-safe">
        <div className="mx-auto flex max-w-lg items-center gap-2 px-4 pt-2">
          <button onClick={() => go(-1)} disabled={idx === 0} className="flex h-12 items-center gap-1 px-2 font-semibold disabled:opacity-30">
            <ChevronLeft className="h-5 w-5" /> Back
          </button>
          <div className="flex flex-1 justify-center">
            {rest ? (
              <button
                onClick={() => setRest((r) => (r ? { ...r, useMax: !r.useMax } : r))}
                onDoubleClick={() => setRest(null)}
                className="flex h-12 items-center gap-2 rounded-full bg-primary px-5 text-lg font-bold tabular-nums text-primary-foreground"
              >
                <Timer className="h-5 w-5" />
                {fmtDuration(Math.max(0, restRemaining))}
                <span className="text-[10px] font-semibold opacity-70">{rest.useMax ? "MAX" : "MIN"}</span>
              </button>
            ) : (
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                <Timer className="h-4 w-4" /> Rest
              </span>
            )}
          </div>
          <button onClick={() => go(1)} disabled={idx === total} className="flex h-12 items-center gap-1 px-2 font-semibold text-primary disabled:opacity-30">
            {idx === total - 1 ? "Finish" : "Next"} <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </footer>
    </div>
  );
}

function CardioBlock({ seconds, done, onToggle }: { seconds: number; done: boolean; onToggle: () => void }) {
  const [left, setLeft] = useState(seconds);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(() => {
      setLeft((l) => {
        if (l <= 1) {
          setRunning(false);
          beep();
          return 0;
        }
        return l - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [running]);
  return (
    <div className="mt-6 flex flex-col items-center gap-5 rounded-2xl bg-card py-8">
      <div className="font-display text-6xl font-bold tabular-nums">{fmtDuration(left)}</div>
      <div className="flex gap-3">
        <button
          onClick={() => {
            unlockAudio();
            setRunning((r) => !r);
          }}
          className="flex h-12 items-center gap-2 rounded-full bg-primary px-6 font-bold text-primary-foreground"
        >
          {running ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          {running ? "Pause" : "Start"}
        </button>
        <button onClick={() => { setRunning(false); setLeft(seconds); }} className="h-12 rounded-full bg-secondary px-5 font-semibold">
          Reset
        </button>
      </div>
      <button
        onClick={onToggle}
        className={`flex h-14 items-center gap-2 rounded-full border-[3px] px-6 font-bold ${done ? "border-success bg-success text-success-foreground" : "border-success/50"}`}
      >
        <Check className="h-5 w-5" strokeWidth={3} /> Done
      </button>
    </div>
  );
}

