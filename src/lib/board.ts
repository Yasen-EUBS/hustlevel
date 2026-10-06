import { supabase } from "@/integrations/supabase/client";
import { epley } from "@/lib/titan";

export type BoardEntry = {
  userId: string;
  name: string;
  max: number;
  best: { reps: number; kg: number; date: string };
  last: { reps: number | null; weight_kg: number | null }[];
};

/** Ranks every athlete who has logged this exercise by best Epley e1RM. */
export async function fetchBoard(key: string): Promise<BoardEntry[]> {
  const { data, error } = await supabase
    .from("set_logs")
    .select("user_id, set_number, reps, weight_kg, session_id, workout_sessions!inner(session_date, started_at)")
    .eq("exercise_key", key)
    .eq("completed", true)
    .not("reps", "is", null);
  if (error) throw error;

  type Acc = { max: number; best: BoardEntry["best"]; lastSession: string; lastKey: string; sets: Map<string, { n: number; reps: number; kg: number }[]> };
  const users = new Map<string, Acc>();
  for (const d of data) {
    const reps = d.reps ?? 0;
    const kg = Number(d.weight_kg ?? 0);
    const date = d.workout_sessions.session_date;
    const order = `${date}|${d.workout_sessions.started_at}`;
    const e = epley(kg, reps);
    let u = users.get(d.user_id);
    if (!u) {
      u = { max: 0, best: { reps, kg, date }, lastSession: d.session_id, lastKey: order, sets: new Map() };
      users.set(d.user_id, u);
    }
    if (e > u.max) {
      u.max = e;
      u.best = { reps, kg, date };
    }
    if (order > u.lastKey) {
      u.lastKey = order;
      u.lastSession = d.session_id;
    }
    const list = u.sets.get(d.session_id) ?? [];
    list.push({ n: d.set_number, reps, kg });
    u.sets.set(d.session_id, list);
  }

  const ids = [...users.keys()];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: profs } = await supabase.from("profiles").select("id, display_name").in("id", ids);
    profs?.forEach((p) => p.display_name && names.set(p.id, p.display_name));
  }

  return ids
    .map((id) => {
      const u = users.get(id)!;
      const last = (u.sets.get(u.lastSession) ?? []).sort((a, b) => a.n - b.n).map((s) => ({ reps: s.reps, weight_kg: s.kg }));
      return { userId: id, name: names.get(id) ?? "Athlete", max: u.max, best: u.best, last };
    })
    .sort((a, b) => b.max - a.max);
}
