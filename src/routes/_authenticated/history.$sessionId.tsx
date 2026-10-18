import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { DurationEditor, formatDuration, fromDurationParts, toDurationParts } from "@/components/DurationEditor";
import { format } from "date-fns";
import { ChevronLeft, Pencil, RotateCw, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { fmtKg, fromISO } from "@/lib/titan";

export const Route = createFileRoute("/_authenticated/history/$sessionId")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Session details — HustLevel" },
      { name: "description", content: "HustLevel — log your lifts, track your progress, level up with your crew." },
      { property: "og:title", content: "Session details — HustLevel" },
      { property: "og:description", content: "HustLevel — log your lifts, track your progress, level up with your crew." },
    ],
  }),
  component: SessionDetail,
});

function SessionDetail() {
  const { sessionId } = Route.useParams();
  const { user } = Route.useRouteContext();
  const q = useQuery({
    queryKey: ["session-detail", sessionId],
    queryFn: async () => {
      const [s, l, n] = await Promise.all([
        supabase.from("workout_sessions").select("*").eq("id", sessionId).single(),
        supabase.from("set_logs").select("*").eq("session_id", sessionId).order("created_at"),
        supabase.from("exercise_notes").select("*").eq("session_id", sessionId),
      ]);
      if (s.error) throw s.error;
      return { session: s.data, sets: l.data ?? [], notes: n.data ?? [] };
    },
  });

  const groups: { name: string; key: string; sets: NonNullable<typeof q.data>["sets"] }[] = [];
  q.data?.sets.forEach((s) => {
    let g = groups.find((x) => x.key === s.exercise_key);
    if (!g) groups.push((g = { name: s.exercise_name, key: s.exercise_key, sets: [] }));
    g.sets.push(s);
  });
  groups.forEach((g) => g.sets.sort((a, b) => a.set_number - b.set_number));
  const vol = q.data?.sets.filter((s) => s.completed).reduce((a, s) => a + (s.reps ?? 0) * Number(s.weight_kg ?? 0), 0) ?? 0;

  return (
    <div className="mx-auto min-h-[100dvh] max-w-lg px-5 pb-safe pt-safe">
      <Link to="/history" className="-ml-2 flex items-center py-3 font-semibold text-primary">
        <ChevronLeft className="h-5 w-5" /> History
      </Link>
      {q.data && (
        <>
          <div className="text-sm text-muted-foreground">{format(fromISO(q.data.session.session_date), "EEEE, d MMM yyyy")}</div>
          <h1 className="font-display text-3xl font-extrabold uppercase">{q.data.session.day_title}</h1>
          <div className="mt-1 text-sm font-semibold text-primary">{Math.round(vol)} kg total volume</div>
          {q.data.session.completed_at && (
            <DurationRow
              sessionId={sessionId}
              startedAt={q.data.session.started_at}
              completedAt={q.data.session.completed_at}
              editable={q.data.session.user_id === user.id}
            />
          )}
          {q.data.session.user_id === user.id && q.data.session.completed_at && q.data.sets.some((x) => x.completed) && (
            <CoachCard sessionId={sessionId} saved={q.data.session.coach_summary} completedAt={q.data.session.completed_at} />
          )}
          <div className="mt-6 space-y-4 pb-8">
            {groups.map((g) => {
              const note = q.data!.notes.find((n) => n.exercise_key === g.key)?.note;
              return (
                <div key={g.key} className="rounded-2xl bg-card p-4">
                  <div className="font-semibold">{g.name}</div>
                  <div className="mt-2 space-y-1 text-sm">
                    {g.sets.map((s) => (
                      <div key={s.id} className={`flex justify-between ${s.completed ? "" : "text-muted-foreground line-through"}`}>
                        <span>Set {s.set_number}</span>
                        <span className="font-semibold">{s.reps == null ? "Done" : `${s.reps} × ${fmtKg(Number(s.weight_kg ?? 0))} kg`}</span>
                      </div>
                    ))}
                  </div>
                  {note && <p className="mt-2 text-sm italic text-muted-foreground">{note}</p>}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function DurationRow({
  sessionId,
  startedAt,
  completedAt,
  editable,
}: {
  sessionId: string;
  startedAt: string;
  completedAt: string;
  editable: boolean;
}) {
  const qc = useQueryClient();
  const seconds = (new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000;
  const [draft, setDraft] = useState<{ hours: string; minutes: string } | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!draft) return;
    const secs = fromDurationParts(draft);
    if (secs <= 0) {
      toast.error("Duration must be at least 1 minute");
      return;
    }
    setSaving(true);
    // Duration = completed_at - started_at, so move the start time.
    const started = new Date(new Date(completedAt).getTime() - secs * 1000).toISOString();
    const { error } = await supabase.from("workout_sessions").update({ started_at: started }).eq("id", sessionId);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setDraft(null);
    qc.invalidateQueries({ queryKey: ["session-detail", sessionId] });
    qc.invalidateQueries({ queryKey: ["history"] });
    qc.invalidateQueries({ queryKey: ["sessions"] });
    toast.success("Duration updated");
  }

  if (draft) {
    return (
      <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-card p-4">
        <DurationEditor hours={draft.hours} minutes={draft.minutes} onChange={setDraft} />
        <div className="flex flex-col gap-2">
          <button onClick={save} disabled={saving} className="h-10 rounded-full bg-primary px-5 font-bold text-primary-foreground disabled:opacity-60">
            {saving ? "Saving…" : "Save"}
          </button>
          <button onClick={() => setDraft(null)} className="h-10 rounded-full px-5 font-semibold text-muted-foreground">
            Cancel
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
      <span>
        Duration <b className="text-foreground">{formatDuration(seconds)}</b>
      </span>
      {editable && (
        <button
          aria-label="Edit duration"
          onClick={() => setDraft(toDurationParts(seconds))}
          className="flex h-8 items-center gap-1 rounded-full px-2 font-semibold text-primary"
        >
          <Pencil className="h-3.5 w-3.5" /> Edit
        </button>
      )}
    </div>
  );
}

/**
 * AI review of the finished session. Generated once (server saves it), automatically for
 * sessions finished in the last day, on request for older ones.
 */
function CoachCard({ sessionId, saved, completedAt }: { sessionId: string; saved: string | null; completedAt: string }) {
  const qc = useQueryClient();
  const recent = Date.now() - new Date(completedAt).getTime() < 86_400_000;
  const [asked, setAsked] = useState(false);
  const coach = useQuery({
    queryKey: ["coach", sessionId],
    enabled: !saved && (recent || asked),
    staleTime: Infinity,
    retry: false,
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/coach-summary", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
        body: JSON.stringify({ sessionId }),
      });
      const body = (await res.json().catch(() => null)) as { summary?: string; error?: string } | null;
      if (!res.ok || !body?.summary) throw new Error(body?.error ?? "The coach couldn't review this session right now.");
      qc.invalidateQueries({ queryKey: ["session-detail", sessionId] });
      return body.summary;
    },
  });
  const text = saved ?? coach.data;

  return (
    <section aria-label="Coach review" className="mt-5 rounded-2xl border border-primary/30 bg-card p-4">
      <div className="flex items-center gap-2 text-[11px] font-bold tracking-widest text-primary">
        <Sparkles className="h-3.5 w-3.5" /> COACH
      </div>
      {text ? (
        <div className="guide-md mt-2 text-sm leading-relaxed">
          <ReactMarkdown>{text}</ReactMarkdown>
        </div>
      ) : coach.isFetching ? (
        <div className="mt-3 space-y-2" aria-label="Coach is reviewing your session">
          <p className="text-sm text-muted-foreground">Reviewing your session…</p>
          <div className="h-3 w-11/12 animate-pulse rounded bg-muted" />
          <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
        </div>
      ) : coach.isError ? (
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">{coach.error.message}</p>
          <button onClick={() => coach.refetch()} className="flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-primary">
            <RotateCw className="h-3.5 w-3.5" /> Retry
          </button>
        </div>
      ) : (
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">Get a short review and what to change next time.</p>
          <button onClick={() => setAsked(true)} className="h-9 shrink-0 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground">
            Review
          </button>
        </div>
      )}
    </section>
  );
}
