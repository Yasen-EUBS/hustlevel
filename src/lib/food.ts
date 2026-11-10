// Calorie tracker client helpers. nutrition_profiles and meals are owner-only (RLS); never join them anywhere shared.
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type NutritionProfile = Tables<"nutrition_profiles">;
export type Meal = Tables<"meals">;

export const ACTIVITY = ["Mostly sitting", "Some walking (5–8k steps)", "On my feet a lot (8k+ steps)", "Physical job"];
export const GOALS = ["Lose fat", "Stay the same", "Build muscle"];
export const PACES = ["Slow and easy", "Steady"];

export async function fetchNutritionProfile(): Promise<NutritionProfile | null> {
  const { data: s } = await supabase.auth.getSession();
  const uid = s.session?.user.id;
  if (!uid) return null;
  const { data, error } = await supabase.from("nutrition_profiles").select("*").eq("user_id", uid).maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchMeals(date: string): Promise<Meal[]> {
  const { data: s } = await supabase.auth.getSession();
  const uid = s.session?.user.id;
  if (!uid) return [];
  const { data, error } = await supabase
    .from("meals").select("*").eq("user_id", uid).eq("eaten_on", date).order("created_at");
  if (error) throw error;
  return data ?? [];
}

/** POSTs to an AI route with the caller's token; throws the route's friendly error message. */
export async function postAi<T>(path: string, body: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
    body: JSON.stringify(body),
  });
  const out = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !out) throw new Error(out?.error ?? "Something went wrong. Try again.");
  return out;
}

/** Downscales a photo to max 1280 px on the long side and returns a JPEG data URL. */
export async function photoToDataUrl(file: File, maxSide = 1280): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.8);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function readFlag(key: string) {
  try { return localStorage.getItem(key) != null; } catch { return false; }
}
export function setFlag(key: string) {
  try { localStorage.setItem(key, String(Date.now())); } catch { /* private mode */ }
}
