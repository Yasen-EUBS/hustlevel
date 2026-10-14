import { supabase } from "@/integrations/supabase/client";

export const normKey = (name: string) => name.trim().toLowerCase();

export const epley = (w: number, r: number) => (r > 0 && w > 0 ? Math.round(w * (1 + r / 30)) : 0);

export function toISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
export function fromISO(s: string) {
  const [y = 0, m = 1, d = 1] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export const isoWeekday = (d: Date) => ((d.getDay() + 6) % 7) + 1;

export function fmtKg(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
}

export function fmtRest(min: number, max: number) {
  const m = (s: number) => (s % 60 === 0 ? `${s / 60}` : `${(s / 60).toFixed(1)}`);
  return min === max ? `${m(min)}min` : `${m(min)}-${m(max)}min`;
}

export function fmtDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export type ProgramExercise = {
  id: string;
  letter: string;
  section: string;
  name: string;
  sets: number;
  rep_min: number | null;
  rep_max: number | null;
  duration_seconds: number | null;
  tempo: string | null;
  rest_min_seconds: number;
  rest_max_seconds: number;
  note: string | null;
};

export function repText(e: ProgramExercise) {
  if (e.duration_seconds) return `${e.sets} x ${fmtDuration(e.duration_seconds)}`;
  const r = e.rep_max && e.rep_max !== e.rep_min ? `${e.rep_min}-${e.rep_max}` : `${e.rep_min ?? ""}`;
  return `${e.sets} x ${r}`;
}

export type SetRow = { reps: number | null; weight_kg: number | null };

export function formatLast(sets: SetRow[]) {
  const s = sets.filter((x) => x.reps != null);
  const first = s[0];
  if (!first) return "—";
  const ws = s.map((x) => Number(x.weight_kg ?? 0));
  const w0 = ws[0] ?? 0;
  const sameW = ws.every((w) => w === w0);
  const sameR = s.every((x) => x.reps === first.reps);
  if (sameW && sameR && s.length > 1) return `${s.length} x ${first.reps} @ ${fmtKg(w0)} kg`;
  if (sameW) return `${s.map((x) => x.reps).join(", ")} @ ${fmtKg(w0)} kg`;
  return s.map((x, i) => `${x.reps}@${fmtKg(ws[i] ?? 0)}`).join(", ") + " kg";
}

/** TrainHeroic-style summary of completed sets: "2 x 9 @ 104kg", "5,4 @ 97kg", "8,8 @ 60,65kg". */
export function formatDone(sets: SetRow[]) {
  const s = sets.filter((x) => x.reps != null);
  const first = s[0];
  if (!first) return "Done";
  const reps = s.map((x) => x.reps);
  const ws = s.map((x) => Number(x.weight_kg ?? 0));
  const sameR = reps.every((r) => r === first.reps);
  const sameW = ws.every((w) => w === ws[0]);
  const repPart = sameR ? `${s.length} x ${first.reps}` : reps.join(",");
  if (ws.every((w) => w === 0)) return repPart; // bodyweight
  return `${repPart} @ ${sameW ? fmtKg(ws[0] ?? 0) : ws.map(fmtKg).join(",")}kg`;
}

export async function fetchActiveProgram() {
  const { data, error } = await supabase
    .from("programs")
    .select("*, program_days(*, program_exercises(*))")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (data) {
    data.program_days.forEach((d) => d.program_exercises.sort((a, b) => a.letter.localeCompare(b.letter)));
  }
  return data;
}

export function weekOf(startDate: string, date: Date) {
  const diff = Math.floor((date.getTime() - fromISO(startDate).getTime()) / 86400000);
  return Math.floor(diff / 7) + 1;
}

export async function myId() {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error("Not signed in");
  return id;
}

export async function fetchSessions() {
  const uid = await myId();
  const { data, error } = await supabase
    .from("workout_sessions")
    .select("*")
    .eq("user_id", uid)
    .order("session_date", { ascending: false });
  if (error) throw error;
  return data;
}

let audioCtx: AudioContext | null = null;
export function unlockAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  } catch {}
}
export function beep() {
  try {
    unlockAudio();
    if (!audioCtx) return;
    [0, 0.25].forEach((t) => {
      const o = audioCtx!.createOscillator();
      const g = audioCtx!.createGain();
      o.frequency.value = 880;
      o.connect(g);
      g.connect(audioCtx!.destination);
      const at = audioCtx!.currentTime + t;
      g.gain.setValueAtTime(0.3, at);
      g.gain.exponentialRampToValueAtTime(0.001, at + 0.2);
      o.start(at);
      o.stop(at + 0.2);
    });
  } catch {}
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
}
