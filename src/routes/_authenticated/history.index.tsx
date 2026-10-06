import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageTitle, TabShell } from "@/components/TabShell";
import { fromISO, myId } from "@/lib/titan";

export const Route = createFileRoute("/_authenticated/history/")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "History — NSS" },
      { name: "description", content: "All your completed training sessions." },
      { property: "og:title", content: "History — NSS" },
      { property: "og:description", content: "All your completed training sessions." },
    ],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const q = useQuery({
    queryKey: ["history"],
    queryFn: async () => {
      const uid = await myId();
      const { data, error } = await supabase
        .from("workout_sessions")
        .select("id, session_date, day_title, started_at, completed_at, set_logs(reps, weight_kg, completed)")
        .eq("user_id", uid)
        .not("completed_at", "is", null)
        .order("session_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <TabShell>
      <PageTitle>History</PageTitle>
      <div className="space-y-2 px-5">
        {q.isLoading && <p className="text-muted-foreground">Loading…</p>}
        {q.data?.length === 0 && <p className="rounded-2xl bg-card p-6 text-center text-muted-foreground">No completed sessions yet.</p>}
        {q.data?.map((s) => {
          const vol = s.set_logs.filter((l) => l.completed).reduce((a, l) => a + (l.reps ?? 0) * Number(l.weight_kg ?? 0), 0);
          const mins = s.completed_at ? Math.round((new Date(s.completed_at).getTime() - new Date(s.started_at).getTime()) / 60000) : 0;
          return (
            <Link key={s.id} to="/history/$sessionId" params={{ sessionId: s.id }} className="flex items-center gap-3 rounded-2xl bg-card p-4">
              <div className="w-12 text-center">
                <div className="text-xs font-bold uppercase text-primary">{format(fromISO(s.session_date), "MMM")}</div>
                <div className="font-display text-2xl font-bold">{format(fromISO(s.session_date), "d")}</div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{s.day_title}</div>
                <div className="text-sm text-muted-foreground">
                  {Math.round(vol)} kg · {mins} min
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </Link>
          );
        })}
      </div>
    </TabShell>
  );
}
