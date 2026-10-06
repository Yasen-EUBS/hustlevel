import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ChevronLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fmtKg, fromISO } from "@/lib/titan";

export const Route = createFileRoute("/_authenticated/history/$sessionId")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Session details — NSS" },
      { name: "description", content: "Every set from a completed session." },
      { property: "og:title", content: "Session details — NSS" },
      { property: "og:description", content: "Every set from a completed session." },
    ],
  }),
  component: SessionDetail,
});

function SessionDetail() {
  const { sessionId } = Route.useParams();
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
