// Pure nutrition rules shared by /api/nutrition-plan (after the AI answers) and manual edits on /food.

export type Stats = { sex: string; age: number; height_cm: number; weight_kg: number };
export type Macros = { calories: number; protein_g: number; carbs_g: number; fat_g: number };

/** Mifflin-St Jeor; the female constant applies whenever sex is not "male". */
export function bmr(s: Stats) {
  const base = 10 * s.weight_kg + 6.25 * s.height_cm - 5 * s.age;
  return s.sex.trim().toLowerCase() === "male" ? base + 5 : base - 161;
}

export function calorieBounds(s: Stats) {
  const b = bmr(s);
  const male = s.sex.trim().toLowerCase() === "male";
  const min = s.age < 18 ? Math.round(b * 1.4) : Math.max(Math.round(b), male ? 1500 : 1200);
  const max = Math.round(b * 2.6) + 500;
  return { min, max };
}

/** Clamps a plan into the safety rails and makes the macros add up to the calories. */
export function applyRails(s: Stats, m: Macros): Macros & { clamped: "min" | "max" | null } {
  const { min, max } = calorieBounds(s);
  const raw = Number.isFinite(m.calories) ? m.calories : min;
  let clamped: "min" | "max" | null = null;
  let calories = raw;
  if (raw < min) { calories = min; clamped = "min"; }
  else if (raw > max) { calories = max; clamped = "max"; }
  calories = Math.round(calories / 10) * 10;
  const w = s.weight_kg;
  const protein_g = Math.round(Math.min(2.6 * w, Math.max(1.2 * w, Number(m.protein_g) || 0)));
  const fat_g = Math.round(Math.max(0.6 * w, Number(m.fat_g) || 0));
  const carbs_g = Math.max(0, Math.round((calories - protein_g * 4 - fat_g * 9) / 4));
  return { calories, protein_g, carbs_g, fat_g, clamped };
}

export function railNote(clamped: "min" | "max" | null) {
  return clamped === "min"
    ? " Adjusted to a safe minimum for your size."
    : clamped === "max"
      ? " Adjusted to a safe maximum for your size."
      : "";
}
