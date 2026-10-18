import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { fetchBoard } from "@/lib/board";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ChevronLeft, Trophy } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { epley, fmtKg, fromISO, myId } from "@/lib/titan";

export const Route = createFileRoute("/_authenticated/progress/$key")({
  validateSearch: z.object({ tab: z.enum(["charts", "leaderboard"]).optional() }),
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Exercise progress — HustLevel" },
      { name: "description", content: "HustLevel — log your lifts, track your progress, level up with your crew." },
      { property: "og:title", content: "Exercise progress — HustLevel" },
      { property: "og:description", content: "HustLevel — log your lifts, track your progress, level up with your crew." },
    ],
  }),
  component: ExerciseProgress,
});

function ExerciseProgress() {
  const { key } = Route.useParams();
  const { tab = "charts" } = Route.useSearch();
  const { user } = Route.useRouteContext();
  const navigate = useNavigate({ from: "/progress/$key" });
  const nameQ = useQuery({
    queryKey: ["exercise-name", key],
    queryFn: async () => (await supabase.from("set_logs").select("exercise_name").eq("exercise_key", key).limit(1).maybeSingle()).data?.exercise_name ?? key,
  });
  const q = useQuery({
    queryKey: ["exercise-progress", key],
    queryFn: async () => {
      const uid = await myId();
      const { data, error } = await supabase
        .from("set_logs")
        .select("id, exercise_name, set_number, reps, weight_kg, session_id, workout_sessions!inner(session_date, started_at)")
        .eq("exercise_key", key)
        .eq("user_id", uid)
        .eq("completed", true)
        .not("reps", "is", null);
      if (error) throw error;
      const bySession = new Map<string, { date: string; started: string; sets: { n: number; reps: number; kg: number }[] }>();
      data.forEach((d) => {
        const s = bySession.get(d.session_id) ?? { date: d.workout_sessions.session_date, started: d.workout_sessions.started_at, sets: [] };
        s.sets.push({ n: d.set_number, reps: d.reps ?? 0, kg: Number(d.weight_kg ?? 0) });
        bySession.set(d.session_id, s);
      });
      const sessions = [...bySession.entries()]
        .map(([id, s]) => {
          s.sets.sort((a, b) => a.n - b.n);
          return {
            id,
            ...s,
            e1rm: Math.max(...s.sets.map((x) => epley(x.kg, x.reps))),
            top: Math.max(...s.sets.map((x) => x.kg)),
            volume: Math.round(s.sets.reduce((a, x) => a + x.kg * x.reps, 0)),
            label: format(fromISO(s.date), "d MMM"),
          };
        })
        .sort((a, b) => (a.date === b.date ? a.started.localeCompare(b.started) : a.date.localeCompare(b.date)));
      type Best = { reps: number; kg: number; e: number; date: string };
      const bestRef: { v: Best | null } = { v: null };
      sessions.forEach((s) =>
        s.sets.forEach((x) => {
          const e = epley(x.kg, x.reps);
          if (!bestRef.v || e > bestRef.v.e) bestRef.v = { reps: x.reps, kg: x.kg, e, date: s.date };
        }),
      );
      return { name: data[0]?.exercise_name ?? key, sessions, best: bestRef.v };
    },
  });

  const d = q.data;
  return (
    <div className="mx-auto min-h-[100dvh] max-w-lg px-5 pb-safe pt-safe">
      <Link to="/progress" className="-ml-2 flex items-center py-3 font-semibold text-primary">
        <ChevronLeft className="h-5 w-5" /> Progress
      </Link>
      <h1 className="font-display text-3xl font-extrabold uppercase">{nameQ.data ?? ""}</h1>
      <div className="mt-4 grid grid-cols-2 rounded-full bg-card p-1 text-sm font-bold">
        {(["charts", "leaderboard"] as const).map((t) => (
          <button
            key={t}
            onClick={() => navigate({ search: { tab: t }, replace: true })}
            className={`h-10 rounded-full capitalize ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          >
            {t === "charts" ? "My Progress" : "Leaderboard"}
          </button>
        ))}
      </div>
      {tab === "leaderboard" && <Leaderboard exerciseKey={key} me={user.id} />}
      {tab === "charts" && d && d.sessions.length === 0 && (
        <p className="mt-6 rounded-2xl bg-card p-6 text-center text-muted-foreground">You haven't logged this exercise yet.</p>
      )}
      {tab === "charts" && d && d.sessions.length > 0 && (
        <>
          {d.best && (
            <div className="mt-4 flex items-center gap-3 rounded-2xl bg-card p-4">
              <Trophy className="h-6 w-6 text-primary" />
              <div className="flex-1">
                <div className="text-[11px] font-bold tracking-widest text-muted-foreground">ALL-TIME BEST SET</div>
                <div className="font-bold">
                  {d.best.reps} × {fmtKg(d.best.kg)} kg <span className="text-muted-foreground">· {format(fromISO(d.best.date), "d MMM yyyy")}</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[11px] font-bold tracking-widest text-muted-foreground">E1RM</div>
                <div className="font-bold text-primary">{d.best.e} kg</div>
              </div>
            </div>
          )}
          <Chart title="Estimated 1RM (kg)" data={d.sessions} dataKey="e1rm" color="var(--chart-1)" />
          <Chart title="Top set weight (kg)" data={d.sessions} dataKey="top" color="var(--chart-2)" />
          <Chart title="Total volume (kg)" data={d.sessions} dataKey="volume" color="var(--chart-3)" />
          <h2 className="mt-8 text-xs font-bold tracking-widest text-muted-foreground">ALL SESSIONS</h2>
          <div className="mt-2 space-y-2 pb-10">
            {[...d.sessions].reverse().map((s) => (
              <div key={s.id} className="rounded-2xl bg-card p-4 text-sm">
                <div className="flex justify-between font-semibold">
                  <span>{format(fromISO(s.date), "EEE d MMM yyyy")}</span>
                  <span className="text-primary">e1RM {s.e1rm}</span>
                </div>
                <div className="mt-1 text-muted-foreground">{s.sets.map((x) => `${x.reps}×${fmtKg(x.kg)}`).join("  ·  ")} kg</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Chart({ title, data, dataKey, color }: { title: string; data: object[]; dataKey: string; color: string }) {
  return (
    <div className="mt-4 rounded-2xl bg-card p-4">
      <div className="mb-2 text-sm font-semibold">{title}</div>
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ left: -20, right: 8, top: 8 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} domain={["auto", "auto"]} />
            <Tooltip contentStyle={{ background: "var(--popover)", border: "none", borderRadius: 12, color: "var(--foreground)" }} />
            <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={3} dot={{ r: 4, fill: color }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

const medals = ["bg-medal-gold", "bg-medal-silver", "bg-medal-bronze"];

function Leaderboard({ exerciseKey, me }: { exerciseKey: string; me: string }) {
  const q = useQuery({ queryKey: ["board", exerciseKey], queryFn: () => fetchBoard(exerciseKey) });
  const sharing = useQuery({
    queryKey: ["profile", me],
    queryFn: async () => (await supabase.from("profiles").select("*").eq("id", me).maybeSingle()).data,
  });
  const hidden = sharing.isSuccess && !sharing.data?.share_workouts;
  if (q.isLoading) return <p className="mt-6 text-muted-foreground">Loading…</p>;
  const rows = q.data ?? [];
  const note = hidden ? (
    <p className="mt-4 rounded-2xl bg-card p-4 text-sm text-muted-foreground">
      Only you can see your lifts. Turn on <b className="text-foreground">Share my workouts</b> in Me to appear on the
      leaderboard.
    </p>
  ) : null;
  if (!rows.length)
    return (
      <>
        {note}
        <p className="mt-6 rounded-2xl bg-card p-6 text-center text-muted-foreground">Nobody has logged this yet.</p>
      </>
    );
  return (
    <>
    {note}
    <ol className="mt-4 space-y-2 pb-10">
      {rows.map((e, i) => (
        <li
          key={e.userId}
          className={`flex items-center gap-3 rounded-2xl p-4 ${e.userId === me ? "bg-accent ring-2 ring-primary" : "bg-card"}`}
        >
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${medals[i] ? `${medals[i]} text-primary-foreground` : "text-muted-foreground"}`}>{i + 1}</span>
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">
              {e.name}
              {e.userId === me && <span className="ml-1 text-xs text-primary">(you)</span>}
            </div>
            <div className="text-xs text-muted-foreground">
              {fmtKg(e.best.kg)} kg × {e.best.reps} · {format(fromISO(e.best.date), "d MMM yyyy")}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-bold tracking-widest text-muted-foreground">MAX</div>
            <div className="font-bold text-primary">{e.max} kg</div>
          </div>
        </li>
      ))}
    </ol>
    </>
  );
}
