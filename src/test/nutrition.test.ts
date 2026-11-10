import { describe, expect, it } from "vitest";
import { applyRails, bmr, calorieBounds } from "@/lib/nutrition";

const woman = { sex: "female", age: 30, height_cm: 165, weight_kg: 60 };
const man = { sex: "male", age: 30, height_cm: 180, weight_kg: 80 };

describe("nutrition rails", () => {
  it("uses Mifflin-St Jeor with the female constant when not male", () => {
    expect(bmr(woman)).toBeCloseTo(1320.25);
    expect(bmr({ ...woman, sex: "other" })).toBeCloseTo(1320.25);
    expect(bmr(man)).toBeCloseTo(1780);
  });
  it("minimum is max(bmr, 1200 female / 1500 male)", () => {
    expect(calorieBounds(woman).min).toBe(1320);
    expect(calorieBounds({ ...woman, weight_kg: 40, height_cm: 150 }).min).toBe(1200);
    expect(calorieBounds(man).min).toBe(1780);
  });
  it("under 18 minimum is bmr * 1.4", () => {
    const teen = { ...man, age: 16 };
    expect(calorieBounds(teen).min).toBe(Math.round(bmr(teen) * 1.4));
  });
  it("maximum is bmr * 2.6 + 500", () => {
    expect(calorieBounds(man).max).toBe(5128);
  });
  it("raises a crash diet to the minimum and flags it", () => {
    const r = applyRails(woman, { calories: 800, protein_g: 120, carbs_g: 50, fat_g: 40 });
    expect(r.calories).toBe(1320);
    expect(r.clamped).toBe("min");
  });
  it("clamps protein to 1.2–2.6 g/kg and fat to at least 0.6 g/kg, carbs fill the rest", () => {
    const r = applyRails(man, { calories: 2500, protein_g: 300, carbs_g: 0, fat_g: 20 });
    expect(r.protein_g).toBe(208);
    expect(r.fat_g).toBe(48);
    expect(r.carbs_g).toBe(Math.round((2500 - 208 * 4 - 48 * 9) / 4));
    expect(r.clamped).toBeNull();
  });
  it("rounds calories to the nearest 10", () => {
    expect(applyRails(man, { calories: 2504, protein_g: 160, carbs_g: 0, fat_g: 70 }).calories).toBe(2500);
  });
});
