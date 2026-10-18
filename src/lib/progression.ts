/**
 * Double-progression rules shared by the in-session hints, next-session suggested
 * weights and the AI coach summary (server). Pure functions only: no Supabase or DOM,
 * so the server route can import this file too.
 *
 * Rule (from the training guide): once a set reaches the top of its rep range with
 * clean form, add ~5–10% load; if reps fall below the bottom of the range, the load
 * is too heavy, so drop it a little. Inside the range: keep the weight and beat the reps.
 */

export type RepRange = {
  rep_min: number | null;
  rep_max: number | null;
  duration_seconds?: number | null;
};
export type Verdict = "up" | "down" | "hold";

/** Plate/pin step: 1 kg for light loads (dumbbells, cables), 2.5 kg otherwise. */
export const stepFor = (kg: number) => (kg < 20 ? 1 : 2.5);

const roundTo = (n: number, step: number) => Math.round(n / step) * step;
const clean = (n: number) => Math.round(n * 10) / 10;

export function heavier(kg: number) {
  const step = stepFor(kg);
  return clean(Math.max(kg + step, roundTo(kg * 1.05, step)));
}

export function lighter(kg: number) {
  const step = stepFor(kg);
  return clean(Math.max(0, Math.min(kg - step, roundTo(kg * 0.95, step))));
}

/** null when the exercise has no rep target (timed work, open-ended sets). */
export function verdict(range: RepRange, reps: number | null | undefined): Verdict | null {
  if (range.duration_seconds || reps == null || reps <= 0) return null;
  const min = range.rep_min;
  const max = range.rep_max ?? range.rep_min;
  if (min == null || max == null) return null;
  if (reps >= max) return "up";
  if (reps < min) return "down";
  return "hold";
}

export function rangeText(range: RepRange) {
  const { rep_min: min, rep_max: max } = range;
  if (min == null) return "";
  return max && max !== min ? `${min}–${max}` : `${min}`;
}

/** Weight to suggest for a set next session, based on what that set did last time. */
export function nextWeight(
  range: RepRange,
  reps: number | null,
  kg: number | null,
): { kg: number; verdict: Verdict } | null {
  if (kg == null || kg <= 0) return null;
  const v = verdict(range, reps);
  if (v === "up") return { kg: heavier(kg), verdict: "up" };
  if (v === "down") return { kg: lighter(kg), verdict: "down" };
  return null;
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, ""));

/**
 * Short in-session tip for a just-completed set. `hasNextSet` switches the wording
 * between "next set" and "next time". Returns null when no tip is useful.
 */
export function setTip(
  range: RepRange,
  reps: number,
  kg: number,
  hasNextSet: boolean,
): { tone: "up" | "down"; text: string } | null {
  const v = verdict(range, reps);
  if (v == null || v === "hold") return null;
  const when = hasNextSet ? "next set" : "next time";
  const r = rangeText(range);
  if (kg <= 0) {
    return v === "up"
      ? { tone: "up", text: `Top of ${r}. Add weight or slow the tempo ${when}.` }
      : {
          tone: "down",
          text: `Under ${range.rep_min} reps. Use assistance ${when} to stay in ${r}.`,
        };
  }
  if (v === "up") {
    const top = range.rep_max ?? range.rep_min;
    const label = top != null && reps > top ? `Above ${r}` : `Top of ${r}`;
    return { tone: "up", text: `${label}. If it felt easy, try ${fmt(heavier(kg))} kg ${when}.` };
  }
  return {
    tone: "down",
    text: `Under ${range.rep_min} reps. Try ${fmt(lighter(kg))} kg ${when} to stay in ${r}.`,
  };
}
