import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ChevronLeft,
  ImagePlus,
  Loader2,
  Play,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useExerciseMedia } from "@/lib/exercise-media";
import { normKey } from "@/lib/titan";
import { startDateFor, type DraftExercise, type DraftProgram } from "@/lib/program-import";

export const Route = createFileRoute("/_authenticated/program/import")({
  head: () => ({
    meta: [
      { title: "Import program — HustLevel" },
      {
        name: "description",
        content: "Turn screenshots of a training program into a plan you can log.",
      },
      { property: "og:title", content: "Import program — HustLevel" },
      {
        property: "og:description",
        content: "Turn screenshots of a training program into a plan you can log.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ImportPage,
});

const MAX_SHOTS = 10;
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Shot = { id: string; preview: string; data: string };

/** Downscales a screenshot to a JPEG data URL (long side ≤ 2000px) so uploads stay small. */
async function toJpeg(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("unreadable"));
      i.src = url;
    });
    const scale = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const blankExercise = (): DraftExercise => ({
  name: "",
  section: "STRENGTH/POWER",
  sets: 3,
  rep_min: 8,
  rep_max: 12,
  duration_seconds: null,
  tempo: null,
  rest_min_seconds: 120,
  rest_max_seconds: 120,
  note: null,
});

function ImportPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const media = useExerciseMedia();
  const input = useRef<HTMLInputElement>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [phase, setPhase] = useState<"pick" | "reading" | "review" | "saving">("pick");
  const [draft, setDraft] = useState<DraftProgram | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    if (phase !== "reading") return undefined;
    setElapsed(0);
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  async function addFiles(list: FileList | null) {
    if (!list) return;
    const room = MAX_SHOTS - shots.length;
    const files = Array.from(list).slice(0, room);
    if (list.length > room) toast.message(`Up to ${MAX_SHOTS} screenshots at a time.`);
    const added: Shot[] = [];
    for (const f of files) {
      try {
        const data = await toJpeg(f);
        added.push({ id: crypto.randomUUID(), preview: data, data });
      } catch {
        toast.error(`Couldn't open ${f.name}`);
      }
    }
    setShots((s) => [...s, ...added]);
    setError(null);
  }

  async function read() {
    setPhase("reading");
    setError(null);
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/program-import", {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${data.session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ images: shots.map((s) => s.data) }),
      });
      const body = (await res.json().catch(() => null)) as {
        draft?: DraftProgram;
        warnings?: string[];
        error?: string;
      } | null;
      if (!res.ok || !body?.draft)
        throw new Error(body?.error ?? "Couldn't read these screenshots. Try again.");
      setDraft(body.draft);
      setWarnings(body.warnings ?? []);
      setPhase("review");
      window.scrollTo({ top: 0 });
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setPhase("pick");
    }
  }

  const problems = draft ? validate(draft) : [];

  async function save() {
    if (!draft || problems.length) return;
    setPhase("saving");
    const payload = {
      name: draft.name,
      block_name: draft.block_name,
      total_weeks: draft.total_weeks,
      start_date: startDateFor(draft.current_week),
      coach_notes: draft.coach_notes,
      days: draft.days.map((d) => ({ ...d, exercises: d.exercises.filter((e) => e.name.trim()) })),
    };
    const { error: err } = await supabase.rpc("import_program", { p: payload as unknown as Json });
    if (err) {
      toast.error(err.message);
      setPhase("review");
      return;
    }
    await qc.invalidateQueries({ queryKey: ["program"] });
    qc.invalidateQueries({ queryKey: ["programs-list"] });
    qc.invalidateQueries({ queryKey: ["profile"] });
    toast.success(`Imported. You're now following ${draft.name}.`);
    navigate({ to: "/training" });
  }

  const setD = (patch: Partial<DraftProgram>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const setDay = (i: number, patch: Partial<DraftProgram["days"][number]>) =>
    setDraft((d) =>
      d ? { ...d, days: d.days.map((x, j) => (j === i ? { ...x, ...patch } : x)) } : d,
    );
  const setEx = (di: number, ei: number, patch: Partial<DraftExercise>) =>
    setDraft((d) =>
      d
        ? {
            ...d,
            days: d.days.map((x, j) =>
              j === di
                ? {
                    ...x,
                    exercises: x.exercises.map((e, k) => (k === ei ? { ...e, ...patch } : e)),
                  }
                : x,
            ),
          }
        : d,
    );

  return (
    <div className="mx-auto min-h-[100dvh] max-w-lg px-5 pb-safe pt-safe">
      <header className="flex items-center gap-2 py-2">
        <button
          aria-label="Back"
          onClick={() => (phase === "review" ? setPhase("pick") : navigate({ to: "/program" }))}
          className="-ml-2 p-2"
          disabled={phase === "saving"}
        >
          <ChevronLeft className="h-7 w-7" />
        </button>
        <h1 className="font-display text-xl font-extrabold uppercase">
          {phase === "review" || phase === "saving" ? "Check your program" : "Import program"}
        </h1>
      </header>

      {(phase === "pick" || phase === "reading") && (
        <>
          <p className="mt-1 text-muted-foreground">
            Add screenshots of every training day: exercises, sets, reps and rest. Clear,
            full-screen shots work best.
          </p>
          <div className="mt-5 grid grid-cols-3 gap-2">
            {shots.map((s) => (
              <div key={s.id} className="relative aspect-[9/16] overflow-hidden rounded-xl bg-card">
                <img
                  src={s.preview}
                  alt="Screenshot to import"
                  className="h-full w-full object-cover object-top"
                />
                {phase === "pick" && (
                  <button
                    aria-label="Remove screenshot"
                    onClick={() => setShots((list) => list.filter((x) => x.id !== s.id))}
                    className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-background/80"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
            {shots.length < MAX_SHOTS && phase === "pick" && (
              <button
                onClick={() => input.current?.click()}
                className="flex aspect-[9/16] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary/40 text-sm font-semibold text-primary"
              >
                <ImagePlus className="h-7 w-7" />
                Add
              </button>
            )}
          </div>
          <input
            ref={input}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              void addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          {error && (
            <p role="alert" className="mt-4 rounded-xl bg-card p-3 text-sm text-destructive">
              {error}
            </p>
          )}
          <button
            onClick={read}
            disabled={!shots.length || phase === "reading"}
            className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-primary text-lg font-bold text-primary-foreground disabled:opacity-50"
          >
            {phase === "reading" ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" /> Reading screenshots… {elapsed}s
              </>
            ) : (
              `Read ${shots.length || ""} screenshot${shots.length === 1 ? "" : "s"}`
            )}
          </button>
          {phase === "reading" && (
            <p className="mt-3 text-center text-sm text-muted-foreground">
              This usually takes 20–60 seconds. You'll check everything before it's saved.
            </p>
          )}
        </>
      )}

      {draft && (phase === "review" || phase === "saving") && (
        <div className="space-y-4 pb-36">
          {warnings.length > 0 && (
            <div className="rounded-2xl border border-partial/40 bg-card p-4 text-sm">
              <div className="flex items-center gap-2 font-semibold text-partial">
                <AlertTriangle className="h-4 w-4" /> Double-check these
              </div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-3 rounded-2xl bg-card p-4">
            <Field label="PROGRAM NAME">
              <input
                value={draft.name}
                maxLength={80}
                onChange={(e) => setD({ name: e.target.value })}
                className={text}
              />
            </Field>
            <Field label="BLOCK / PHASE">
              <input
                value={draft.block_name}
                maxLength={80}
                onChange={(e) => setD({ block_name: e.target.value })}
                className={text}
              />
            </Field>
            <Field label="THIS WEEK">
              <div className="flex items-center gap-2 text-base">
                Week
                <NumberBox
                  value={draft.current_week}
                  min={1}
                  max={draft.total_weeks}
                  onChange={(v) => setD({ current_week: v ?? 1 })}
                  label="Current week"
                />
                of
                <NumberBox
                  value={draft.total_weeks}
                  min={1}
                  max={52}
                  onChange={(v) =>
                    setD({
                      total_weeks: v ?? 1,
                      current_week: Math.min(draft.current_week, v ?? 1),
                    })
                  }
                  label="Total weeks"
                />
              </div>
            </Field>
            {draft.coach_notes && (
              <Field label="COACH NOTES">
                <textarea
                  value={draft.coach_notes}
                  rows={4}
                  maxLength={4000}
                  onChange={(e) => setD({ coach_notes: e.target.value || null })}
                  className={`${text} resize-y text-sm leading-relaxed`}
                />
              </Field>
            )}
          </div>

          {draft.days.map((day, di) => (
            <section key={di} className="rounded-2xl bg-card p-4">
              <div className="flex items-center gap-2">
                <select
                  aria-label="Weekday"
                  value={day.weekday}
                  onChange={(e) => setDay(di, { weekday: Number(e.target.value) })}
                  className="h-10 rounded-lg bg-background px-2 font-bold text-primary outline-none"
                >
                  {DAYS.map((d, i) => (
                    <option key={d} value={i + 1}>
                      {d}
                    </option>
                  ))}
                </select>
                <input
                  aria-label="Day title"
                  value={day.title}
                  maxLength={80}
                  onChange={(e) => setDay(di, { title: e.target.value })}
                  className="h-10 min-w-0 flex-1 rounded-lg bg-background px-3 font-semibold outline-none ring-primary focus:ring-2"
                />
                <button
                  aria-label={`Remove ${day.title}`}
                  onClick={() => setD({ days: draft.days.filter((_, j) => j !== di) })}
                  className="flex h-10 w-10 shrink-0 items-center justify-center text-muted-foreground"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <ol className="mt-3 space-y-3">
                {day.exercises.map((ex, ei) => (
                  <li key={ei} className="rounded-xl bg-background p-3">
                    <div className="flex items-center gap-2">
                      <span className="w-5 text-sm font-bold text-muted-foreground">
                        {String.fromCharCode(65 + ei)}
                      </span>
                      <input
                        aria-label="Exercise name"
                        value={ex.name}
                        placeholder="Exercise name"
                        maxLength={80}
                        onChange={(e) => setEx(di, ei, { name: e.target.value })}
                        className="min-w-0 flex-1 bg-transparent font-semibold outline-none placeholder:text-muted-foreground"
                      />
                      {media.data?.[normKey(ex.name)] && (
                        <span
                          title="Has a demo video"
                          className="flex items-center gap-1 rounded-full bg-card px-2 py-0.5 text-[11px] font-bold text-success"
                        >
                          <Play className="h-3 w-3" fill="currentColor" /> DEMO
                        </span>
                      )}
                      <button
                        aria-label={`Remove ${ex.name || "exercise"}`}
                        onClick={() =>
                          setDay(di, { exercises: day.exercises.filter((_, k) => k !== ei) })
                        }
                        className="flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 pl-7 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        Sets
                        <NumberBox
                          value={ex.sets}
                          min={1}
                          max={10}
                          onChange={(v) => setEx(di, ei, { sets: v ?? 1 })}
                          label="Sets"
                        />
                      </span>
                      {ex.duration_seconds ? (
                        <span className="flex items-center gap-1.5">
                          Min
                          <NumberBox
                            value={Math.round(ex.duration_seconds / 60)}
                            min={1}
                            max={120}
                            onChange={(v) => setEx(di, ei, { duration_seconds: (v ?? 1) * 60 })}
                            label="Minutes"
                          />
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5">
                          Reps
                          <NumberBox
                            value={ex.rep_min}
                            min={1}
                            max={100}
                            onChange={(v) => setEx(di, ei, { rep_min: v })}
                            label="Minimum reps"
                          />
                          –
                          <NumberBox
                            value={ex.rep_max}
                            min={1}
                            max={100}
                            onChange={(v) => setEx(di, ei, { rep_max: v })}
                            label="Maximum reps"
                          />
                        </span>
                      )}
                      <span className="flex items-center gap-1.5">
                        Rest
                        <NumberBox
                          value={Math.round(ex.rest_min_seconds / 30) / 2}
                          step={0.5}
                          min={0}
                          max={15}
                          onChange={(v) => {
                            const s = Math.round((v ?? 0) * 60);
                            setEx(di, ei, {
                              rest_min_seconds: s,
                              rest_max_seconds: Math.max(s, ex.rest_max_seconds),
                            });
                          }}
                          label="Rest minimum, minutes"
                        />
                        –
                        <NumberBox
                          value={Math.round(ex.rest_max_seconds / 30) / 2}
                          step={0.5}
                          min={0}
                          max={15}
                          onChange={(v) =>
                            setEx(di, ei, {
                              rest_max_seconds: Math.max(
                                ex.rest_min_seconds,
                                Math.round((v ?? 0) * 60),
                              ),
                            })
                          }
                          label="Rest maximum, minutes"
                        />
                        min
                      </span>
                    </div>
                    {ex.note && (
                      <p className="mt-2 pl-7 text-xs text-muted-foreground">{ex.note}</p>
                    )}
                  </li>
                ))}
              </ol>
              {day.exercises.length < 25 && (
                <button
                  onClick={() => setDay(di, { exercises: [...day.exercises, blankExercise()] })}
                  className="mt-3 flex h-10 items-center gap-1.5 px-1 text-sm font-semibold text-primary"
                >
                  <Plus className="h-4 w-4" /> Add exercise
                </button>
              )}
            </section>
          ))}

          <p className="px-1 text-sm text-muted-foreground">
            Exercises marked DEMO already have a video and how-to. Your history and leaderboards
            carry over for any exercise with the same name.
          </p>
        </div>
      )}

      {draft && (phase === "review" || phase === "saving") && (
        <footer className="fixed inset-x-0 bottom-0 border-t bg-background/95 pb-safe backdrop-blur">
          <div className="mx-auto max-w-lg px-5 pt-3">
            {problems.length > 0 && (
              <p className="pb-2 text-center text-sm text-partial">{problems[0]}</p>
            )}
            <button
              onClick={save}
              disabled={phase === "saving" || problems.length > 0}
              className="mb-3 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-success text-lg font-bold text-success-foreground disabled:opacity-50"
            >
              {phase === "saving" ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
              {phase === "saving" ? "Saving…" : "Save & follow this program"}
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}

function validate(d: DraftProgram): string[] {
  const out: string[] = [];
  if (!d.days.length) out.push("Add at least one training day.");
  const wd = d.days.map((x) => x.weekday);
  if (new Set(wd).size !== wd.length) out.push("Two days share a weekday. Give each day its own.");
  if (d.days.some((x) => !x.exercises.some((e) => e.name.trim())))
    out.push("Every day needs at least one named exercise.");
  return out;
}

const text =
  "w-full rounded-lg bg-background px-3 py-2 font-semibold outline-none ring-primary focus:ring-2";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold tracking-widest text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

/** Compact numeric input that allows clearing while typing. */
function NumberBox({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
}: {
  value: number | null;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number | null) => void;
  label: string;
}) {
  const [txt, setTxt] = useState(value == null ? "" : String(value));
  useEffect(() => setTxt(value == null ? "" : String(value)), [value]);
  return (
    <input
      aria-label={label}
      inputMode={step < 1 ? "decimal" : "numeric"}
      value={txt}
      onChange={(e) => setTxt(e.target.value.replace(/[^0-9.,]/g, ""))}
      onBlur={() => {
        const n = parseFloat(txt.replace(",", "."));
        if (!Number.isFinite(n)) {
          onChange(null);
          return;
        }
        const v = Math.min(max, Math.max(min, Math.round(n / step) * step));
        onChange(v);
        setTxt(String(v));
      }}
      className="h-9 w-12 rounded-lg bg-card text-center font-bold text-foreground outline-none ring-primary focus:ring-2"
    />
  );
}
