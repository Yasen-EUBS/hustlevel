// Shape of an imported program draft, shared by the import API (server) and the review screen.

export type DraftExercise = {
  name: string;
  section: "STRENGTH/POWER" | "RECOVERY";
  sets: number;
  rep_min: number | null;
  rep_max: number | null;
  duration_seconds: number | null;
  tempo: string | null;
  rest_min_seconds: number;
  rest_max_seconds: number;
  note: string | null;
};
export type DraftDay = {
  weekday: number;
  title: string;
  day_notes: string | null;
  exercises: DraftExercise[];
};
export type DraftProgram = {
  name: string;
  block_name: string;
  total_weeks: number;
  /** Which week of the block the lifter is in today (sets the program start date). */
  current_week: number;
  coach_notes: string | null;
  days: DraftDay[];
};

const str = (v: unknown, max: number) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
const int = (v: unknown, lo: number, hi: number) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : null;
};

// Typical spreads when the screenshots don't say which weekday a day falls on.
const SPREAD: Record<number, number[]> = {
  1: [1],
  2: [1, 4],
  3: [1, 3, 5],
  4: [1, 2, 4, 5],
  5: [1, 2, 3, 4, 5],
  6: [1, 2, 3, 4, 5, 6],
  7: [1, 2, 3, 4, 5, 6, 7],
};

/** ISO date of the Monday that starts week 1, given today's week number in the block. */
export function startDateFor(currentWeek: number, today = new Date()) {
  const x = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7) - (Math.max(1, currentWeek) - 1) * 7);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

/** Turns loosely-typed model output into a valid draft, or null if there is no program in it. */
export function normalizeDraft(raw: unknown): { draft: DraftProgram | null; warnings: string[] } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const warnings = Array.isArray(r["warnings"])
    ? (r["warnings"] as unknown[])
        .map((w) => str(w, 200))
        .filter((w): w is string => !!w)
        .slice(0, 8)
    : [];
  const rawDays = Array.isArray(r["days"]) ? (r["days"] as unknown[]) : [];

  let days: DraftDay[] = rawDays
    .map((d, i) => {
      const o = (d && typeof d === "object" ? d : {}) as Record<string, unknown>;
      const exs = (Array.isArray(o["exercises"]) ? (o["exercises"] as unknown[]) : [])
        .map((e): DraftExercise | null => {
          const x = (e && typeof e === "object" ? e : {}) as Record<string, unknown>;
          const name = str(x["name"], 80);
          if (!name) return null;
          const duration = int(x["duration_seconds"], 1, 7200);
          let min = duration ? null : int(x["rep_min"], 1, 100);
          let max = duration ? null : int(x["rep_max"], 1, 100);
          if (min == null && max != null) min = max;
          if (min != null && max != null && min > max) [min, max] = [max, min];
          const rmin = int(x["rest_min_seconds"], 0, 900) ?? 120;
          const rmax = Math.max(rmin, int(x["rest_max_seconds"], 0, 900) ?? rmin);
          return {
            name,
            section:
              String(x["section"] ?? "").toUpperCase() === "RECOVERY"
                ? "RECOVERY"
                : "STRENGTH/POWER",
            sets: int(x["sets"], 1, 10) ?? 3,
            rep_min: min,
            rep_max: max,
            duration_seconds: duration,
            tempo: str(x["tempo"], 20),
            rest_min_seconds: rmin,
            rest_max_seconds: rmax,
            note: str(x["note"], 500),
          };
        })
        .filter((e): e is DraftExercise => !!e)
        .slice(0, 25);
      return {
        weekday: int(o["weekday"], 1, 7) ?? 0,
        title: str(o["title"], 80) ?? `Day ${i + 1}`,
        day_notes: str(o["day_notes"], 2000),
        exercises: exs,
      };
    })
    .filter((d) => d.exercises.length > 0)
    .slice(0, 7);

  if (!days.length)
    return {
      draft: null,
      warnings: warnings.length ? warnings : ["No training program found in these screenshots."],
    };

  // Give every day a distinct weekday; fall back to a common spread when unknown or clashing.
  const weekdays = days.map((d) => d.weekday);
  const clash = weekdays.some((w) => !w) || new Set(weekdays).size !== weekdays.length;
  if (clash) {
    const spread = SPREAD[days.length]!;
    days = days.map((d, i) => ({ ...d, weekday: spread[i]! }));
    warnings.push("Training days were placed on typical weekdays. Check them below.");
  }
  days.sort((a, b) => a.weekday - b.weekday);

  return {
    draft: {
      name: str(r["name"], 80) ?? "My program",
      block_name: str(r["block_name"], 80) ?? "Block 1",
      total_weeks: int(r["total_weeks"], 1, 52) ?? 8,
      current_week: Math.min(
        int(r["total_weeks"], 1, 52) ?? 52,
        int(r["current_week"], 1, 52) ?? 1,
      ),
      coach_notes: str(r["coach_notes"], 4000),
      days,
    },
    warnings,
  };
}
