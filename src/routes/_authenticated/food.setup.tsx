import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, Loader2, Minus, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { fetchActiveProgram } from "@/lib/titan";
import { ACTIVITY, GOALS, PACES, fetchNutritionProfile, postAi } from "@/lib/food";

export const Route = createFileRoute("/_authenticated/food/setup")({
  head: () => ({
    meta: [
      { title: "Set up your calorie plan — HustLevel" },
      { name: "description", content: "Answer a few questions and the AI sets your daily calories and macros." },
      { property: "og:title", content: "Set up your calorie plan — HustLevel" },
      { property: "og:description", content: "Answer a few questions and the AI sets your daily calories and macros." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SetupPage,
});

type Plan = { calories: number; protein_g: number; carbs_g: number; fat_g: number; summary: string };

function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{children}</div>;
}

function Chips({ options, value, other, onPick, onOther, placeholder }: {
  options: string[]; value: string; other: boolean; onPick: (v: string) => void; onOther: (v: string) => void; placeholder: string;
}) {
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {[...options, "Other"].map((o) => {
          const on = o === "Other" ? other : !other && value === o;
          return (
            <button key={o} type="button" onClick={() => (o === "Other" ? onOther(options.includes(value) ? "" : value) : onPick(o))}
              className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${on ? "border-primary bg-primary text-primary-foreground" : "bg-card text-foreground"}`}>
              {o}
            </button>
          );
        })}
      </div>
      {other && (
        <textarea value={value} onChange={(e) => onOther(e.target.value)} maxLength={300} rows={2} placeholder={placeholder}
          className="mt-2 w-full rounded-xl border bg-card px-3 py-3 text-base" />
      )}
    </div>
  );
}

function SetupPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const profile = useQuery({ queryKey: ["nutrition-profile"], queryFn: fetchNutritionProfile });
  const program = useQuery({ queryKey: ["program"], queryFn: fetchActiveProgram });
  const [sex, setSex] = useState("");
  const [age, setAge] = useState("");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [activity, setActivity] = useState(""); const [actOther, setActOther] = useState(false);
  const [days, setDays] = useState<number | null>(null);
  const [goal, setGoal] = useState(""); const [goalOther, setGoalOther] = useState(false);
  const [pace, setPace] = useState(""); const [paceOther, setPaceOther] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [filled, setFilled] = useState(false);

  useEffect(() => {
    const p = profile.data;
    if (filled || profile.isLoading) return;
    setFilled(true);
    if (!p) return;
    setSex(p.sex ?? ""); setAge(p.age?.toString() ?? ""); setHeight(p.height_cm?.toString() ?? ""); setWeight(p.weight_kg?.toString() ?? "");
    setActivity(p.activity ?? ""); setActOther(!!p.activity && !ACTIVITY.includes(p.activity));
    if (p.training_days != null) setDays(p.training_days);
    setGoal(p.goal ?? ""); setGoalOther(!!p.goal && !GOALS.includes(p.goal));
    setPace(p.pace ?? ""); setPaceOther(!!p.pace && !PACES.includes(p.pace));
    setNotes(p.notes ?? "");
  }, [profile.data, profile.isLoading, filled]);

  const programDays = program.data?.program_days.filter((d) => d.program_exercises.length > 0).length;
  const trainingDays = days ?? Math.min(7, programDays ?? 3);
  const needsPace = goalOther || goal === "Lose fat" || goal === "Build muscle";
  const body = {
    sex, age: Number(age), height_cm: Number(height), weight_kg: Number(weight),
    activity: activity.trim(), training_days: trainingDays, goal: goal.trim(),
    pace: needsPace ? pace.trim() : "", notes: notes.trim(),
  };
  const missing = !sex ? "Choose your sex." : !(body.age >= 13 && body.age <= 90) ? "Age must be 13–90." :
    !(body.height_cm >= 120 && body.height_cm <= 230) ? "Height must be 120–230 cm." :
    !(body.weight_kg >= 30 && body.weight_kg <= 250) ? "Weight must be 30–250 kg." :
    !body.activity ? "Pick your activity outside the gym." : !body.goal ? "Pick a goal." : null;

  async function build() {
    if (missing) { toast.error(missing); return; }
    setBusy(true);
    try {
      setPlan(await postAi<Plan>("/api/nutrition-plan", body));
      window.scrollTo({ top: 0 });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function use() {
    if (!plan) return;
    setBusy(true);
    const { data: s } = await supabase.auth.getSession();
    const { error } = await supabase.from("nutrition_profiles").upsert({
      user_id: s.session!.user.id, ...body, pace: body.pace || null, notes: body.notes || null,
      calories: plan.calories, protein_g: plan.protein_g, carbs_g: plan.carbs_g, fat_g: plan.fat_g,
      plan_summary: plan.summary, plan_generated_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    });
    setBusy(false);
    if (error) { toast.error("Couldn't save your plan. Try again."); return; }
    await qc.invalidateQueries({ queryKey: ["nutrition-profile"] });
    navigate({ to: "/food" });
  }

  return (
    <div className="mx-auto min-h-[100dvh] max-w-lg px-5 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-safe">
      <div className="flex items-center gap-2 py-3">
        <Link to="/food" aria-label="Back" className="-ml-2 rounded-full p-2"><ChevronLeft className="h-6 w-6" /></Link>
        <h1 className="font-display text-2xl font-extrabold uppercase">{plan ? "Your plan" : "Calorie plan"}</h1>
      </div>

      {plan ? (
        <div className="space-y-5">
          <div className="rounded-2xl border bg-card p-5">
            <div className="text-5xl font-extrabold text-primary">{plan.calories}</div>
            <div className="text-sm text-muted-foreground">calories per day</div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              {[["Protein", plan.protein_g], ["Carbs", plan.carbs_g], ["Fat", plan.fat_g]].map(([l, v]) => (
                <div key={l} className="rounded-xl bg-secondary/40 py-3"><div className="text-xl font-bold">{v}g</div><div className="text-xs text-muted-foreground">{l}</div></div>
              ))}
            </div>
            <p className="mt-4 text-base leading-relaxed">{plan.summary}</p>
          </div>
          <Button className="h-12 w-full text-base" onClick={use} disabled={busy}>Use this plan</Button>
          <Button variant="secondary" className="h-12 w-full text-base" onClick={() => setPlan(null)} disabled={busy}>Change my answers</Button>
        </div>
      ) : (
        <div className="space-y-6">
          <div>
            <Label>Sex</Label>
            <div className="grid grid-cols-2 gap-2">
              {["female", "male"].map((s) => (
                <button key={s} type="button" onClick={() => setSex(s)}
                  className={`h-12 rounded-xl border text-base font-semibold capitalize ${sex === s ? "border-primary bg-primary text-primary-foreground" : "bg-card"}`}>{s}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {([["Age", age, setAge], ["Height (cm)", height, setHeight], ["Weight (kg)", weight, setWeight]] as const).map(([l, v, set]) => (
              <label key={l}><Label>{l}</Label>
                <input inputMode="decimal" type="number" value={v} onChange={(e) => set(e.target.value)} aria-label={l}
                  className="h-12 w-full rounded-xl border bg-card px-3 text-base" /></label>
            ))}
          </div>
          <div><Label>Activity outside the gym</Label>
            <Chips options={ACTIVITY} value={activity} other={actOther} placeholder="Describe your typical day"
              onPick={(v) => { setActivity(v); setActOther(false); }} onOther={(v) => { setActivity(v); setActOther(true); }} /></div>
          <div><Label>Training days per week</Label>
            <div className="flex items-center gap-4">
              <Button variant="secondary" size="icon" className="h-12 w-12" aria-label="Fewer days" onClick={() => setDays(Math.max(0, trainingDays - 1))}><Minus /></Button>
              <span className="w-8 text-center text-2xl font-bold">{trainingDays}</span>
              <Button variant="secondary" size="icon" className="h-12 w-12" aria-label="More days" onClick={() => setDays(Math.min(7, trainingDays + 1))}><Plus /></Button>
            </div></div>
          <div><Label>Goal</Label>
            <Chips options={GOALS} value={goal} other={goalOther} placeholder="Describe your goal"
              onPick={(v) => { setGoal(v); setGoalOther(false); }} onOther={(v) => { setGoal(v); setGoalOther(true); }} /></div>
          {needsPace && (
            <div><Label>Pace</Label>
              <Chips options={PACES} value={pace} other={paceOther} placeholder="e.g. 2 kg in a month"
                onPick={(v) => { setPace(v); setPaceOther(false); }} onOther={(v) => { setPace(v); setPaceOther(true); }} /></div>
          )}
          <div><Label>Anything else the AI should know?</Label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={600} rows={3}
              placeholder="Food preferences, schedule, anything" className="w-full rounded-xl border bg-card px-3 py-3 text-base" /></div>
          <Button className="h-12 w-full text-base" onClick={build} disabled={busy}>
            {busy ? <><Loader2 className="animate-spin" /> Building your plan…</> : "Build my plan"}
          </Button>
        </div>
      )}
    </div>
  );
}
