import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ChevronDown, ChevronLeft, ChevronRight, Minus, Pause, Play, Plus, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Friends } from "@/components/Friends";
import { DurationEditor, fromDurationParts, toDurationParts } from "@/components/DurationEditor";
import { ExerciseVideoSheet, ExerciseVideoTile } from "@/components/ExerciseVideo";
import { useExerciseMedia, type ExerciseMedia } from "@/lib/exercise-media";
import { SelectTimerButton, TimerSheet } from "@/components/Timers";
import { timers } from "@/lib/timers";
import { SQUAD_ID, type WorkoutPost } from "@/lib/chat";
import { nextWeight, rangeText, setTip } from "@/lib/progression";
import { useTipsEnabled } from "@/lib/prefs";
import { LevelTick } from "@/components/LevelTick";
import { TempoHelp } from "@/components/TempoHelp";
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
      { title: "Session — HustLevel" },
      { name: "description", content: "HustLevel — log your lifts, track your progress, level up with your crew." },
      { property: "og:title", content: "Session — HustLevel" },
      { property: "og:description", content: "HustLevel — log your lifts, track your progress, level up with your crew." },
    ],
  }),
  component: SessionPage,
});

type Row = { reps: string; kg: string; done: boolean; suggestedKg?: string | undefined };
type HistSet = { exercise_key: string; reps: number | null; weight_kg: number | null; set_number: number; session_id: string; date: string; started: string };

function SessionPage() {
  const { dayId } = Route.useParams();
  const { date: dateParam, ex: exParam } = Route.useSearch();
  const { user } = Route.useRouteContext();
  const date = dateParam ?? toISO(new Date());
  const navigate = useNavigate();
  const qc = useQueryClient();

  const program = useQuery({ queryKey: ["program"], queryFn: fetchActiveProgram });
  const media = useExerciseMedia();
  const [playing, setPlaying] = useState<ExerciseMedia | null>(null);
  const day = program.data?.program_days?.find((d) => d.id === dayId);
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

  const tipsOn = useTipsEnabled();
  const [rows, setRows] = useState<Record<string, Row[]> | null>(null);
  // Why today's suggested weights differ from last session (per exercise), shown as one line.
  const [adjusted, setAdjusted] = useState<Record<string, { up: number; down: number }>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const persisted = useRef<Record<string, Set<number>>>({});

  useEffect(() => {
    if (rows || !logs.data || !history.data) return;
    const init: Record<string, Row[]> = {};
    const adj: Record<string, { up: number; down: number }> = {};
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
        let kg = prev?.weight_kg != null ? String(prev.weight_kg) : "";
        // Double progression: a set that hit the top of its range last time starts heavier,
        // one that fell under the range starts lighter.
        const same = last[i];
        const nw = tipsOn && same && !e.duration_seconds ? nextWeight(e, same.reps, same.weight_kg) : null;
        if (nw) {
          kg = String(nw.kg);
          const a = (adj[k] ??= { up: 0, down: 0 });
          a[nw.verdict === "up" ? "up" : "down"]++;
        }
        return { reps: "", kg, done: false, suggestedKg: kg || undefined };
      });
    });
    setAdjusted(adj);
    setRows(init);
    setNotes(Object.fromEntries(logs.data.notes.map((n) => [n.exercise_key, n.note])));
  }, [logs.data, history.data, rows, exercises, stats, tipsOn]);

  const [idx, setIdx] = useState(exParam ?? 0);
  const total = exercises.length;

  // Rest timer defaults follow the current exercise
  const curEx = exercises[idx];
  useEffect(() => {
    timers.setRestDefaults(curEx && !curEx.duration_seconds ? { min: curEx.rest_min_seconds, max: curEx.rest_max_seconds } : null);
  }, [curEx]);
  useEffect(() => () => timers.setRestDefaults(null), []);

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

  function startClock() {
    if (!sessionId) return;
    const now = new Date().toISOString();
    qc.setQueryData(["session", dayId, date], (prev: typeof session.data) => (prev ? { ...prev, started_at: now } : prev));
    void supabase.from("workout_sessions").update({ started_at: now }).eq("id", sessionId).then(({ error }) => {
      if (!error) qc.invalidateQueries({ queryKey: ["sessions"] });
    });
  }

  // Tapping an auto-filled weight clears it so the new weight can be typed straight away.
  function focusKg(k: string, i: number) {
    setRows((r) => {
      const row = r?.[k]?.[i];
      if (!r || !row || row.done || !row.suggestedKg || row.kg !== row.suggestedKg) return r;
      const list = [...r[k]!];
      list[i] = { ...row, kg: "" };
      return { ...r, [k]: list };
    });
  }
  // Leaving the field empty brings the suggested weight back.
  function blurKg(k: string, i: number) {
    setRows((r) => {
      const row = r?.[k]?.[i];
      if (!r || !row || row.kg !== "" || !row.suggestedKg) return r;
      const list = [...r[k]!];
      list[i] = { ...row, kg: row.suggestedKg };
      return { ...r, [k]: list };
    });
  }
  function carryWeightForward(k: string, i: number, kg: string) {
    setRows((r) => {
      if (!r) return r;
      const list = (r[k] ?? []).map((row, j) =>
        j > i && !row.done && (row.kg === "" || row.kg === row.suggestedKg) ? { ...row, kg, suggestedKg: kg } : row,
      );
      return { ...r, [k]: list };
    });
  }

  function toggleSet(e: ProgramExercise, i: number) {
    unlockAudio();
    const k = normKey(e.name);
    const row = (rows![k] ?? [])[i]!;
    let next = { ...row, done: !row.done };
    // Start the session clock on the first ticked set of the session (not when the session was opened).
    if (next.done && !Object.values(rows!).some((list) => list.some((r) => r.done))) startClock();
    if (next.done && !e.duration_seconds && next.reps === "") next.reps = String(e.rep_min ?? "");
    updateRow(e, i, next);
    // Only a weight the lifter typed carries forward; untouched sets keep their own suggestion.
    if (next.done && next.kg !== "" && next.kg !== row.suggestedKg) carryWeightForward(k, i, next.kg);
    persist(e, i, next);
    const running = timers.get().timer;
    if (next.done && !e.duration_seconds && (!running || running.type === "rest")) timers.startRest(e.rest_min_seconds, e.rest_max_seconds);
  }

  async function addSet(e: ProgramExercise) {
    const k = normKey(e.name);
    setRows((r) => {
      if (!r) return r;
      const list = r[k] ?? [];
      const last = list[list.length - 1];
      return { ...r, [k]: [...list, { reps: "", kg: last?.kg ?? "", done: false, suggestedKg: last?.kg || undefined }] };
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
  async function postWorkout(durationSec: number) {
    if (!sessionId) return;
    try {
      const { data: prof } = await supabase.from("profiles").select("share_workouts").eq("id", user.id).maybeSingle();
      if (prof && !prof.share_workouts) return;
      const started = session.data?.started_at ? new Date(session.data.started_at).getTime() : Date.now();
      const body: WorkoutPost = {
        title: [day?.title, program.data?.block_name].filter(Boolean).join(" - "),
        duration_sec: durationSec > 0 ? durationSec : Math.max(0, Math.round((Date.now() - started) / 1000)),
        reps: totals.reps,
        volume: totals.vol,
        prs: prs.map((p) => ({ name: p.name, kg: p.best })),
      };
      const { error } = await supabase.from("messages").insert({
        conversation_id: SQUAD_ID,
        sender_id: user.id,
        kind: "workout",
        workout_session_id: sessionId,
        body: JSON.stringify(body),
      });
      // 23505 = already posted for this session; never double-post.
      if (error && error.code !== "23505") console.warn("workout post failed", error.message);
    } catch (err) {
      console.warn("workout post failed", err);
    }
  }
  async function finish() {
    if (!sessionId) return;
    setFinishing(true);
    const now = Date.now();
    const durationSec = duration ? fromDurationParts(duration) : 0;
    const patch: { completed_at: string; started_at?: string } = { completed_at: new Date(now).toISOString() };
    // An edited duration is stored by moving the start time back from the finish time.
    if (durationSec > 0) patch.started_at = new Date(now - durationSec * 1000).toISOString();
    const { error } = await supabase.from("workout_sessions").update(patch).eq("id", sessionId);
    setFinishing(false);
    if (error) { toast.error(error.message); return; }
    await postWorkout(durationSec);
    qc.invalidateQueries();
    toast.success("Session saved");
    navigate({ to: "/history/$sessionId", params: { sessionId } });
  }

  const [duration, setDuration] = useState<{ hours: string; minutes: string } | null>(null);
  const onSummary = rows != null && idx === total;
  useEffect(() => {
    if (!onSummary || duration) return;
    const started = session.data?.started_at ? new Date(session.data.started_at).getTime() : Date.now();
    const anyDone = Object.values(rows ?? {}).some((list) => list.some((r) => r.done));
    setDuration(toDurationParts(anyDone ? (Date.now() - started) / 1000 : 0));
  }, [onSummary, duration, rows, session.data?.started_at]);

  const touchX = useRef<number | null>(null);
  const go = (d: number) => setIdx((i) => Math.min(total, Math.max(0, i + d)));

  if (program.isLoading || !rows) {
    return <div className="flex min-h-[100dvh] items-center justify-center text-muted-foreground">{program.data && !day ? "Day not found" : "Loading session…"}</div>;
  }

  const ex = exercises[idx];
  const k = ex ? normKey(ex.name) : "";
  const demo = media.data?.[k];
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
        <SessionClock
          startedAt={session.data?.started_at}
          completedAt={session.data?.completed_at}
          running={Object.values(rows).some((list) => list.some((r) => r.done))}
        />
      </header>
      <div className="flex justify-center gap-6 pb-2 font-display text-lg font-extrabold">
        <span>
          {totals.reps} <span className="text-sm text-muted-foreground">REPS</span>
        </span>
        <span>
          {totals.vol.toLocaleString("en-US")} <span className="text-sm text-muted-foreground">KG</span>
        </span>
      </div>

      <main className="flex-1 overflow-y-auto px-5 pb-36">
        {ex ? (
          <>
            <div className="pt-3 text-sm font-semibold text-primary">
              {ex.letter}. {ex.section === "RECOVERY" ? "Recovery" : "Strength/Power"}
            </div>
            <h1 className="font-display text-3xl font-extrabold uppercase leading-tight">{ex.name}</h1>

            {(demo || !ex.duration_seconds) && (
              <div className="mt-4 flex items-stretch gap-3">
                {demo && <ExerciseVideoTile media={demo} name={ex.name} onPlay={() => setPlaying(demo)} />}
                {!ex.duration_seconds && (
                <div className="grid min-w-0 flex-1 grid-cols-2 divide-x divide-border rounded-2xl bg-card py-4 text-center">
                <div className="min-w-0 px-1">
                  <div className="text-[11px] font-bold tracking-widest text-muted-foreground">WORKING MAX</div>
                  <div className="mt-1 text-2xl font-bold">{workingMax ? `${workingMax} kg` : "—"}</div>
                </div>
                <div className="min-w-0 px-2">
                  <div className="text-[11px] font-bold tracking-widest text-muted-foreground">LAST</div>
                  <div className="mt-1 text-base font-bold leading-snug">{formatLast(st?.last ?? [])}</div>
                </div>
                </div>
                )}
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
                    <span className="inline-flex items-center gap-0.5">
                      <span className="text-muted-foreground">Tempo&nbsp;</span>
                      <b>{ex.tempo}</b>
                      <TempoHelp tempo={ex.tempo} />
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
                {tipsOn && adjusted[k] && <AdjustNote range={ex} up={adjusted[k].up} down={adjusted[k].down} />}
                <div className="mt-5 grid grid-cols-[3rem_1fr_1fr_3.5rem] gap-2 px-1 text-xs font-bold tracking-widest text-muted-foreground">
                  <div>SETS</div>
                  <div className="text-center">REPS</div>
                  <div className="text-center">KG</div>
                  <div />
                </div>
                <div className="mt-2 space-y-2">
                  {(rows![k] ?? []).map((r, i, list) => (
                    <div key={i}>
                    <div className="grid grid-cols-[3rem_1fr_1fr_3.5rem] items-center gap-2">
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
                        placeholder={r.suggestedKg ?? "kg"}
                        value={r.kg}
                        onFocus={() => focusKg(k, i)}
                        onChange={(e) => updateRow(ex, i, { kg: e.target.value.replace(/[^0-9.,]/g, "") })}
                        onBlur={() => {
                          blurKg(k, i);
                          if (r.done) persist(ex, i, (rows![k] ?? [])[i]!);
                        }}
                        className="h-14 w-full rounded-xl bg-card text-center text-lg font-bold outline-none ring-primary placeholder:font-medium placeholder:text-muted-foreground focus:ring-2"
                      />
                      <button
                        aria-label={`Complete set ${i + 1}`}
                        onClick={() => toggleSet(ex, i)}
                        className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full border-[3px] transition ${r.done ? "level-pop border-primary bg-background" : "border-success/50"}`}
                      >
                        {r.done && <LevelTick className="h-6 w-[26px]" />}
                      </button>
                    </div>
                    {tipsOn && r.done && i === lastDoneIndex(list) && (
                      <SetTipLine
                        range={ex}
                        reps={parseInt(r.reps, 10)}
                        kg={parseFloat(r.kg.replace(",", ".")) || 0}
                        hasNextSet={list.slice(i + 1).some((x) => !x.done)}
                      />
                    )}
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
            <div className="mt-3 flex items-center justify-between rounded-2xl bg-card p-4">
              <div>
                <div className="text-[11px] font-bold tracking-widest text-muted-foreground">DURATION</div>
                <div className="mt-1 text-sm text-muted-foreground">Tap to adjust</div>
              </div>
              {duration && <DurationEditor hours={duration.hours} minutes={duration.minutes} onChange={setDuration} />}
            </div>
            {prs.length > 0 && (
              <div className="mt-6">
                <div className="mb-2 text-xs font-bold tracking-widest text-muted-foreground">NEW WORKING MAX</div>
                <ul className="space-y-2">
                  {prs.map((p) => (
                    <li key={p.name} className="flex items-center gap-3 rounded-xl bg-card p-4">
                      <Trophy className="h-5 w-5 text-primary" />
                      <span className="flex-1 font-semibold">{p.name}</span>
                      <span className="font-bold text-primary">{p.best} kg</span>
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
      <ExerciseVideoSheet media={playing} onClose={() => setPlaying(null)} />
      <TimerSheet />

      <footer className="fixed inset-x-0 bottom-0 border-t bg-background/95 backdrop-blur pb-safe">
        <div className="mx-auto flex max-w-lg items-center gap-2 px-4 pt-2">
          <button onClick={() => go(-1)} disabled={idx === 0} className="flex h-12 items-center gap-1 px-2 font-semibold disabled:opacity-30">
            <ChevronLeft className="h-5 w-5" /> Back
          </button>
          <div className="flex flex-1 justify-center">
            <SelectTimerButton />
          </div>
          <button onClick={() => go(1)} disabled={idx === total} className="flex h-12 items-center gap-1 px-2 font-semibold text-primary disabled:opacity-30">
            {idx === total - 1 ? "Finish" : "Next"} <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </footer>
    </div>
  );
}

const lastDoneIndex = (list: Row[]) => list.reduce((acc, r, i) => (r.done ? i : acc), -1);

/** One quiet line under the most recent ticked set; nothing when reps land inside the range. */
function SetTipLine({ range, reps, kg, hasNextSet }: { range: ProgramExercise; reps: number; kg: number; hasNextSet: boolean }) {
  if (!Number.isFinite(reps)) return null;
  const tip = setTip(range, reps, kg, hasNextSet);
  if (!tip) return null;
  const Icon = tip.tone === "up" ? ArrowUp : ArrowDown;
  return (
    <p role="status" className={`flex items-start gap-1.5 px-2 pt-1.5 text-xs font-semibold ${tip.tone === "up" ? "text-primary" : "text-partial"}`}>
      <Icon className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
      {tip.text}
    </p>
  );
}

/** Explains why today's pre-filled weights differ from last session. */
function AdjustNote({ range, up, down }: { range: ProgramExercise; up: number; down: number }) {
  const r = rangeText(range);
  const text =
    up && !down
      ? `Weights raised: you hit the top of ${r} last time.`
      : down && !up
        ? `Weights lowered: last time some sets fell under ${range.rep_min} reps.`
        : `Weights adjusted to keep each set in ${r}, based on last time.`;
  const Icon = down && !up ? ArrowDown : ArrowUp;
  return (
    <p className="mt-4 flex items-start gap-1.5 rounded-xl bg-card px-3 py-2 text-xs font-semibold text-muted-foreground">
      <Icon className={`mt-px h-3.5 w-3.5 shrink-0 ${down && !up ? "text-partial" : "text-primary"}`} strokeWidth={2.5} />
      {text}
    </p>
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
        className={`flex h-14 items-center gap-2 rounded-full border-[3px] px-6 font-bold ${done ? "level-pop border-primary bg-background text-primary" : "border-success/50"}`}
      >
        {done ? <LevelTick className="h-5 w-[22px]" /> : null} Done
      </button>
    </div>
  );
}


/** Elapsed workout time, TrainHeroic style (top right). Wall-clock based, so it stays right after the phone locks. */
function SessionClock({
  startedAt,
  completedAt,
  running,
}: {
  startedAt: string | null | undefined;
  completedAt: string | null | undefined;
  running: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (completedAt || !running) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [completedAt, running]);
  if (!startedAt) return <div className="w-20" />;
  // Before the first set is ticked the clock waits at 0:00.
  if (!running && !completedAt)
    return (
      <div aria-label="Session time" className="w-20 text-right font-display text-xl font-bold tabular-nums text-muted-foreground">
        0:00
      </div>
    );
  const end = completedAt ? new Date(completedAt).getTime() : now;
  const secs = Math.max(0, Math.floor((end - new Date(startedAt).getTime()) / 1000));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const sec = secs % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  const text = h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
  return (
    <div aria-label="Session time" className="w-20 text-right font-display text-xl font-bold tabular-nums text-primary">
      {text}
    </div>
  );
}
