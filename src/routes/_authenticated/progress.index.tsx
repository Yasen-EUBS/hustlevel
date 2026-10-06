import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageTitle, TabShell } from "@/components/TabShell";

export const Route = createFileRoute("/_authenticated/progress/")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Progress — NSS" },
      { name: "description", content: "Track your estimated 1RM and volume per lift." },
      { property: "og:title", content: "Progress — NSS" },
      { property: "og:description", content: "Track your estimated 1RM and volume per lift." },
    ],
  }),
  component: ProgressPage,
});

function ProgressPage() {
  const [q, setQ] = useState("");
  const list = useQuery({
    queryKey: ["exercise-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("set_logs").select("exercise_key, exercise_name, user_id").eq("completed", true).not("reps", "is", null);
      if (error) throw error;
      const m = new Map<string, { name: string; users: Set<string> }>();
      data.forEach((d) => {
        const e = m.get(d.exercise_key) ?? { name: d.exercise_name, users: new Set<string>() };
        e.users.add(d.user_id);
        m.set(d.exercise_key, e);
      });
      return [...m.entries()].map(([key, v]) => ({ key, name: v.name, count: v.users.size })).sort((a, b) => a.name.localeCompare(b.name));
    },
  });
  const filtered = useMemo(() => (list.data ?? []).filter((e) => e.name.toLowerCase().includes(q.toLowerCase())), [list.data, q]);

  return (
    <TabShell>
      <PageTitle>Progress</PageTitle>
      <div className="px-5">
        <div className="flex h-12 items-center gap-2 rounded-xl bg-card px-4">
          <Search className="h-5 w-5 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search exercises" className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground" />
        </div>
        <div className="mt-4 space-y-2">
          {list.data?.length === 0 && <p className="rounded-2xl bg-card p-6 text-center text-muted-foreground">Log a session to see your progress.</p>}
          {filtered.map((e) => (
            <Link key={e.key} to="/progress/$key" params={{ key: e.key }} className="flex items-center rounded-2xl bg-card p-4">
              <div className="flex-1">
                <div className="font-semibold">{e.name}</div>
                <div className="text-sm text-muted-foreground">{e.count} {e.count === 1 ? "athlete" : "athletes"}</div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </Link>
          ))}
        </div>
      </div>
    </TabShell>
  );
}
