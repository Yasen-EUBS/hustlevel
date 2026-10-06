import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ChevronLeft, Trophy } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { epley, fmtKg, fromISO } from "@/lib/titan";

export const Route = createFileRoute("/_authenticated/progress/$key")({
  head: () => ({
    meta: [
      { title: "Exercise progress — Titan Log" },
      { name: "description", content: "Charts and every logged set for one exercise." },
      { property: "og:title", content: "Exercise progress — Titan Log" },
      { property: "og:description", content: "Charts and every logged set for one exercise." },
    ],
  }),
  component: ExerciseProgress,
});

function ExerciseProgress() {
  const { key } = Route.useParams();
  const q = useQuery({
    queryKey: ["exercise-progress", key],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("set_logs")
        .select("id, exercise_name, set_number, reps, weight_kg, session_id, workout_sessions!inner(session_date, started_at)")
        .eq("exercise_key", key)
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
      let best: { reps: number; kg: number; e: number; date: string } | null = null;
      sessions.forEach((s) =>
        s.sets.forEach((x) => {
          const e = epley(x.kg, x.reps);
          if (!best || e > best.e) best = { reps: x.reps, kg: x.kg, e, date: s.date };
        }),
      );
      return { name: data[0]?.exercise_name ?? key, sessions, best: best as typeof best };
    },
  });

  const d = q.data;
  return (
    <div className="mx-auto min-h-[100dvh] max-w-lg px-5 pb-safe pt-safe">
      <Link to="/progress" className="-ml-2 flex items-center py-3 font-semibold text-primary">
        <ChevronLeft className="h-5 w-5" /> Progress
      </Link>
      {d && (
        <>
          <h1 className="font-display text-3xl font-extrabold uppercase">{d.name}</h1>
          {d.best && (
            <div className="mt-4 flex items-center gap-3 rounded-2xl bg-card p-4">
              <Trophy className="h-6 w-6 text-chart-3" />
              <div className="flex-1">
                <div className="text-[11px] font-bold tracking-widest text-muted-foreground">ALL-TIME BEST SET</div>
                <div className="font-bold">
                  {d.best.reps} × {fmtKg(d.best.kg)} kg <span className="text-muted-foreground">· {format(fromISO(d.best.date), "d MMM yyyy")}</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[11px] font-bold tracking-widest text-muted-foreground">E1RM</div>
                <div className="font-bold text-success">{d.best.e} kg</div>
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
