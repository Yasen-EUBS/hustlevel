import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { addDays, format } from "date-fns";
import { Camera, ChevronLeft, ChevronRight, Image as ImageIcon, Loader2, PencilLine, Plus, Settings2, Type, Utensils } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageTitle, TabShell } from "@/components/TabShell";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { fromISO, toISO } from "@/lib/titan";
import { applyRails, calorieBounds } from "@/lib/nutrition";
import { fetchMeals, fetchNutritionProfile, photoToDataUrl, postAi, setFlag, type Meal, type NutritionProfile } from "@/lib/food";

export const Route = createFileRoute("/_authenticated/food/")({
  head: () => ({
    meta: [
      { title: "Food — HustLevel" },
      { name: "description", content: "Track your calories and macros from a photo of your meal." },
      { property: "og:title", content: "Food — HustLevel" },
      { property: "og:description", content: "Track your calories and macros from a photo of your meal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FoodPage,
});

type Estimate = {
  name: string; items: { name: string; grams: number; calories: number }[];
  calories: number; protein_g: number; carbs_g: number; fat_g: number;
  confidence: "low" | "medium" | "high"; note: string | null;
};
type Draft = { name: string; calories: string; protein_g: string; carbs_g: string; fat_g: string };

const r1 = (n: number) => Math.round(n * 10) / 10;
const toDraft = (m: { name: string; calories: number; protein_g: number; carbs_g: number; fat_g: number }): Draft => ({
  name: m.name, calories: String(m.calories), protein_g: String(r1(m.protein_g)), carbs_g: String(r1(m.carbs_g)), fat_g: String(r1(m.fat_g)),
});
function parseDraft(d: Draft) {
  const n = (s: string, hi: number) => { const x = Number(s); return Number.isFinite(x) && x >= 0 && x <= hi ? x : null; };
  const calories = n(d.calories, 10000), protein_g = n(d.protein_g, 1000), carbs_g = n(d.carbs_g, 1000), fat_g = n(d.fat_g, 1000);
  if (!d.name.trim() || calories == null || protein_g == null || carbs_g == null || fat_g == null) return null;
  return { name: d.name.trim().slice(0, 80), calories: Math.round(calories), protein_g, carbs_g, fat_g };
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{children}</div>;
}

function Bar({ label, eaten, target, unit }: { label: string; eaten: number; target: number; unit: string }) {
  const pct = target > 0 ? Math.min(100, (eaten / target) * 100) : 0;
  const over = eaten - target;
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="font-semibold">{label}</span>
        <span className="text-muted-foreground">{Math.round(eaten)} / {target}{unit}{over > 0 && <> · {Math.round(over)}{unit} over</>}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-secondary/40">
        <div className={`h-full rounded-full ${over > 0 ? "bg-muted-foreground" : "bg-primary"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function MacroFields({ d, set, withName = true }: { d: Draft; set: (d: Draft) => void; withName?: boolean }) {
  const f = (k: keyof Draft, label: string) => (
    <label key={k}><Label>{label}</Label>
      <input aria-label={label} type="number" inputMode="decimal" value={d[k]} onChange={(e) => set({ ...d, [k]: e.target.value })}
        className="h-12 w-full rounded-xl border bg-card px-3 text-base" /></label>
  );
  return (
    <div className="space-y-3">
      {withName && (
        <label className="block"><Label>Meal</Label>
          <input aria-label="Meal name" value={d.name} maxLength={80} onChange={(e) => set({ ...d, name: e.target.value })}
            className="h-12 w-full rounded-xl border bg-card px-3 text-base" /></label>
      )}
      <div className="grid grid-cols-2 gap-2">{f("calories", "Calories")}{f("protein_g", "Protein (g)")}{f("carbs_g", "Carbs (g)")}{f("fat_g", "Fat (g)")}</div>
    </div>
  );
}

function FoodPage() {
  const today = toISO(new Date());
  const [date, setDate] = useState(today);
  const profile = useQuery({ queryKey: ["nutrition-profile"], queryFn: fetchNutritionProfile });
  const meals = useQuery({ queryKey: ["meals", date], queryFn: () => fetchMeals(date), enabled: !!profile.data });
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Meal | null>(null);
  const [settings, setSettings] = useState(false);

  useEffect(() => setFlag("hl_food_seen"), []);

  const p = profile.data;
  const list = meals.data ?? [];
  const sum = (k: "calories" | "protein_g" | "carbs_g" | "fat_g") => list.reduce((a, m) => a + Number(m[k]), 0);
  const eaten = sum("calories");
  const target = p?.calories ?? 0;
  const left = target - eaten;

  return (
    <TabShell>
      <div className="flex items-start justify-between pr-5">
        <PageTitle>Food</PageTitle>
        {p && (
          <Button variant="secondary" size="icon" className="mt-14 h-10 w-10 rounded-full" aria-label="Plan settings" onClick={() => setSettings(true)}>
            <Settings2 className="h-5 w-5" />
          </Button>
        )}
      </div>
      <div className="space-y-4 px-5">
        {profile.isLoading ? (
          <Loader2 className="mx-auto mt-10 h-6 w-6 animate-spin text-muted-foreground" />
        ) : !p ? (
          <div className="rounded-2xl border bg-card p-6 text-center">
            <Utensils className="mx-auto h-10 w-10 text-primary" />
            <h2 className="mt-3 text-xl font-extrabold">Track your calories from a photo</h2>
            <p className="mt-2 text-sm text-muted-foreground">Snap your meal and the AI estimates calories and macros. First, set your daily target — it takes a minute.</p>
            <Button asChild className="mt-5 h-12 w-full text-base"><Link to="/food/setup">Set up my plan</Link></Button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="icon" aria-label="Previous day" onClick={() => setDate(toISO(addDays(fromISO(date), -1)))}><ChevronLeft /></Button>
              <div className="text-center font-semibold">{date === today ? "Today" : format(fromISO(date), "EEE d MMM")}</div>
              <Button variant="ghost" size="icon" aria-label="Next day" disabled={date >= today} onClick={() => setDate(toISO(addDays(fromISO(date), 1)))}><ChevronRight /></Button>
            </div>
            <div className="rounded-2xl border bg-card p-5">
              <div className="text-5xl font-extrabold">{Math.abs(left)}</div>
              <div className="text-sm text-muted-foreground">{left >= 0 ? "calories left" : "calories over"}</div>
              <div className="mt-4"><Bar label="Calories" eaten={eaten} target={target} unit="" /></div>
              <div className="mt-4 space-y-3">
                <Bar label="Protein" eaten={sum("protein_g")} target={p.protein_g ?? 0} unit="g" />
                <Bar label="Carbs" eaten={sum("carbs_g")} target={p.carbs_g ?? 0} unit="g" />
                <Bar label="Fat" eaten={sum("fat_g")} target={p.fat_g ?? 0} unit="g" />
              </div>
            </div>
            <Button className="h-14 w-full text-base" onClick={() => setAdding(true)}><Plus /> Add meal</Button>
            <div className="space-y-2">
              {list.length === 0 && !meals.isLoading && <p className="py-4 text-center text-sm text-muted-foreground">No meals logged for this day.</p>}
              {list.map((m) => (
                <button key={m.id} onClick={() => setEditing(m)} className="flex w-full items-center justify-between rounded-xl border bg-card px-4 py-3 text-left active:bg-secondary/40">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{m.name}</div>
                    <div className="text-xs text-muted-foreground">P {r1(Number(m.protein_g))} · C {r1(Number(m.carbs_g))} · F {r1(Number(m.fat_g))}</div>
                  </div>
                  <div className="ml-3 shrink-0 font-bold">{m.calories} kcal</div>
                </button>
              ))}
            </div>
          </>
        )}
        <p className="pb-4 pt-2 text-center text-xs text-muted-foreground">Photo estimates are rough. This is not medical advice.</p>
      </div>
      {p && <AddMealSheet open={adding} onClose={() => setAdding(false)} date={date} />}
      <EditMealSheet meal={editing} onClose={() => setEditing(null)} />
      {p && <SettingsSheet open={settings} onClose={() => setSettings(false)} profile={p} />}
    </TabShell>
  );
}

function BottomSheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="mx-auto max-h-[90dvh] max-w-lg overflow-y-auto rounded-t-3xl px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <SheetTitle className="pr-10 font-display text-xl font-extrabold uppercase">{title}</SheetTitle>
        <SheetDescription className="sr-only">{title}</SheetDescription>
        <div className="mt-4">{children}</div>
      </SheetContent>
    </Sheet>
  );
}

function AddMealSheet({ open, onClose, date }: { open: boolean; onClose: () => void; date: string }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"pick" | "photo" | "text" | "manual" | "review">("pick");
  const [photo, setPhoto] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [est, setEst] = useState<Estimate | null>(null);
  const [draft, setDraft] = useState<Draft>({ name: "", calories: "", protein_g: "0", carbs_g: "0", fat_g: "0" });
  const [source, setSource] = useState<"photo" | "text" | "manual">("manual");
  const [back, setBack] = useState<"photo" | "text">("text");
  const camRef = useRef<HTMLInputElement>(null);
  const libRef = useRef<HTMLInputElement>(null);

  function reset() {
    setMode("pick"); setPhoto(null); setText(""); setEst(null); setBusy(false);
    setDraft({ name: "", calories: "", protein_g: "0", carbs_g: "0", fat_g: "0" });
  }
  function close() { onClose(); setTimeout(reset, 300); }

  async function onFile(f: File | undefined) {
    if (!f) return;
    try { setPhoto(await photoToDataUrl(f)); setMode("photo"); } catch { toast.error("Couldn't open that photo."); }
  }

  async function estimate(kind: "photo" | "text") {
    setBusy(true);
    try {
      const e = await postAi<Estimate>("/api/meal-estimate", { ...(kind === "photo" && photo ? { image: photo } : {}), ...(text.trim() ? { text: text.trim() } : {}) });
      setEst(e); setDraft(toDraft(e)); setSource(kind); setBack(kind); setMode("review");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong.");
    } finally { setBusy(false); }
  }

  async function save() {
    const m = parseDraft(draft);
    if (!m) { toast.error("Check the numbers: calories 0–10000, macros 0–1000 g."); return; }
    setBusy(true);
    const { error } = await supabase.from("meals").insert({ ...m, eaten_on: date, source, note: est?.note ?? null });
    setBusy(false);
    if (error) { toast.error("Couldn't save the meal. Try again."); return; }
    qc.invalidateQueries({ queryKey: ["meals", date] });
    toast.success("Meal saved");
    close();
  }

  return (
    <BottomSheet open={open} onClose={close} title={mode === "review" ? "Check the estimate" : mode === "manual" ? "Enter manually" : "Add meal"}>
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
      <input ref={libRef} type="file" accept="image/*" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
      {mode === "pick" && (
        <div className="grid grid-cols-2 gap-2">
          {([[Camera, "Take a photo", () => camRef.current?.click()], [ImageIcon, "Choose a photo", () => libRef.current?.click()],
            [Type, "Describe it", () => setMode("text")], [PencilLine, "Enter manually", () => { setSource("manual"); setMode("manual"); }]] as const).map(([Icon, l, fn]) => (
            <button key={l} onClick={fn} className="flex h-24 flex-col items-center justify-center gap-2 rounded-2xl border bg-card font-semibold active:bg-secondary/40">
              <Icon className="h-6 w-6 text-primary" />{l}
            </button>
          ))}
        </div>
      )}
      {(mode === "photo" || mode === "text") && (
        <div className="space-y-3">
          {mode === "photo" && photo && <img src={photo} alt="Your meal" className="max-h-64 w-full rounded-2xl object-cover" />}
          <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={500} rows={3} aria-label="Meal description"
            placeholder={mode === "photo" ? "Optional note: cooked in olive oil, large portion" : "e.g. 2 eggs, 2 slices of toast with butter, a latte"}
            className="w-full rounded-xl border bg-card px-3 py-3 text-base" />
          <Button className="h-12 w-full text-base" disabled={busy || (mode === "text" && !text.trim())} onClick={() => estimate(mode)}>
            {busy ? <><Loader2 className="animate-spin" /> Estimating…</> : "Estimate"}
          </Button>
          <Button variant="ghost" className="w-full" onClick={reset} disabled={busy}>Back</Button>
        </div>
      )}
      {mode === "review" && est && (
        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-3 text-sm">
            {est.items.map((i, n) => (
              <div key={n} className="flex justify-between py-0.5"><span>{i.name} <span className="text-muted-foreground">· {i.grams} g</span></span><span>{i.calories} kcal</span></div>
            ))}
            <div className="mt-2 text-xs text-muted-foreground">Confidence: <b className="capitalize text-foreground">{est.confidence}</b>{est.note && <> · {est.note}</>}</div>
          </div>
          <MacroFields d={draft} set={setDraft} />
          <Button className="h-12 w-full text-base" onClick={save} disabled={busy}>Save</Button>
          <Button variant="secondary" className="h-12 w-full" onClick={() => setMode(back)} disabled={busy}>Try again</Button>
        </div>
      )}
      {mode === "manual" && (
        <div className="space-y-4">
          <MacroFields d={draft} set={setDraft} />
          <Button className="h-12 w-full text-base" onClick={save} disabled={busy}>Save</Button>
          <Button variant="ghost" className="w-full" onClick={reset} disabled={busy}>Back</Button>
        </div>
      )}
    </BottomSheet>
  );
}

function EditMealSheet({ meal, onClose }: { meal: Meal | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [d, setD] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (meal) setD(toDraft({ ...meal, protein_g: Number(meal.protein_g), carbs_g: Number(meal.carbs_g), fat_g: Number(meal.fat_g) })); }, [meal]);
  async function run(fn: () => PromiseLike<{ error: unknown }>, msg: string) {
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) { toast.error("Something went wrong. Try again."); return; }
    qc.invalidateQueries({ queryKey: ["meals", meal!.eaten_on] });
    toast.success(msg);
    onClose();
  }
  return (
    <BottomSheet open={!!meal} onClose={onClose} title="Edit meal">
      {meal && d && (
        <div className="space-y-4">
          <MacroFields d={d} set={setD} />
          <Button className="h-12 w-full text-base" disabled={busy} onClick={() => {
            const m = parseDraft(d);
            if (!m) { toast.error("Check the numbers: calories 0–10000, macros 0–1000 g."); return; }
            run(() => supabase.from("meals").update(m).eq("id", meal.id), "Meal updated");
          }}>Save changes</Button>
          <Button variant="destructive" className="h-12 w-full" disabled={busy} onClick={() => run(() => supabase.from("meals").delete().eq("id", meal.id), "Meal deleted")}>Delete meal</Button>
        </div>
      )}
    </BottomSheet>
  );
}

function SettingsSheet({ open, onClose, profile: p }: { open: boolean; onClose: () => void; profile: NutritionProfile }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [d, setD] = useState<Draft>(toDraft({ name: "", calories: p.calories ?? 0, protein_g: p.protein_g ?? 0, carbs_g: p.carbs_g ?? 0, fat_g: p.fat_g ?? 0 }));
  const [busy, setBusy] = useState(false);
  const stats = p.sex && p.age && p.height_cm && p.weight_kg ? { sex: p.sex, age: p.age, height_cm: Number(p.height_cm), weight_kg: Number(p.weight_kg) } : null;

  async function save() {
    if (!stats) return;
    const r = applyRails(stats, { calories: Number(d.calories), protein_g: Number(d.protein_g), carbs_g: 0, fat_g: Number(d.fat_g) });
    setBusy(true);
    const { error } = await supabase.from("nutrition_profiles").update({
      calories: r.calories, protein_g: r.protein_g, carbs_g: r.carbs_g, fat_g: r.fat_g, updated_at: new Date().toISOString(),
    }).eq("user_id", p.user_id);
    setBusy(false);
    if (error) { toast.error("Couldn't save. Try again."); return; }
    const { min, max } = calorieBounds(stats);
    if (r.clamped === "min") toast(`Calories raised to ${r.calories}, the safe minimum for your size (${min}).`);
    else if (r.clamped === "max") toast(`Calories lowered to ${r.calories}, the safe maximum for your size (${max}).`);
    else toast.success("Targets updated. Carbs fill the remaining calories.");
    await qc.invalidateQueries({ queryKey: ["nutrition-profile"] });
    setEditing(false);
  }

  return (
    <BottomSheet open={open} onClose={() => { setEditing(false); onClose(); }} title="Your plan">
      {editing ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Set calories, protein and fat. Carbs fill the rest. Values stay inside safe limits for your size: protein 1.2–2.6 g and fat at least 0.6 g per kg.</p>
          <div className="grid grid-cols-3 gap-2">
            {(["calories", "protein_g", "fat_g"] as const).map((k) => (
              <label key={k}><Label>{k === "calories" ? "Calories" : k === "protein_g" ? "Protein (g)" : "Fat (g)"}</Label>
                <input aria-label={k} type="number" inputMode="numeric" value={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.value })}
                  className="h-12 w-full rounded-xl border bg-card px-3 text-base" /></label>
            ))}
          </div>
          <Button className="h-12 w-full text-base" onClick={save} disabled={busy || !stats}>Save numbers</Button>
          <Button variant="ghost" className="w-full" onClick={() => setEditing(false)}>Cancel</Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border bg-card p-4">
            <div className="text-3xl font-extrabold text-primary">{p.calories} kcal</div>
            <div className="mt-1 text-sm text-muted-foreground">Protein {p.protein_g}g · Carbs {p.carbs_g}g · Fat {p.fat_g}g</div>
            {p.plan_summary && <p className="mt-3 text-sm leading-relaxed">{p.plan_summary}</p>}
          </div>
          <Button variant="secondary" className="h-12 w-full" onClick={() => { setD(toDraft({ name: "", calories: p.calories ?? 0, protein_g: p.protein_g ?? 0, carbs_g: p.carbs_g ?? 0, fat_g: p.fat_g ?? 0 })); setEditing(true); }}>Edit numbers</Button>
          <Button asChild variant="secondary" className="h-12 w-full"><Link to="/food/setup">Redo my plan</Link></Button>
        </div>
      )}
    </BottomSheet>
  );
}
