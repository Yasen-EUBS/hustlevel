import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Check, ChevronLeft, ImagePlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchActiveProgram } from "@/lib/titan";

export const Route = createFileRoute("/_authenticated/program/")({
  head: () => ({
    meta: [
      { title: "Programs — HustLevel" },
      { name: "description", content: "Switch programs or import one from screenshots." },
      { property: "og:title", content: "Programs — HustLevel" },
      { property: "og:description", content: "Switch programs or import one from screenshots." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProgramsPage,
});

type Listed = {
  id: string;
  name: string;
  block_name: string;
  created_by: string | null;
  days: number;
  creator: string | null;
};

async function fetchPrograms(): Promise<Listed[]> {
  const { data, error } = await supabase
    .from("programs")
    .select("id, name, block_name, created_by, created_at, is_active, program_days(id)")
    .or("is_active.eq.true,created_by.not.is.null")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const ids = [...new Set(data.map((p) => p.created_by).filter((x): x is string => !!x))];
  const names = ids.length
    ? ((await supabase.from("profiles").select("id, display_name").in("id", ids)).data ?? [])
    : [];
  return data
    .map((p) => ({
      id: p.id,
      name: p.name,
      block_name: p.block_name,
      created_by: p.created_by,
      days: p.program_days.length,
      creator: p.created_by
        ? (names.find((n) => n.id === p.created_by)?.display_name ?? "Athlete")
        : null,
    }))
    .sort((a, b) => Number(!!a.created_by) - Number(!!b.created_by)); // built-in first, then newest
}

function ProgramsPage() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const current = useQuery({ queryKey: ["program"], queryFn: fetchActiveProgram });
  const list = useQuery({ queryKey: ["programs-list"], queryFn: fetchPrograms });
  const [busy, setBusy] = useState<string | null>(null);

  async function follow(p: Listed) {
    if (p.id === current.data?.id) return;
    setBusy(p.id);
    // NULL means "the built-in default", so it follows future default blocks automatically.
    const { error } = await supabase
      .from("profiles")
      .upsert({ id: user.id, program_id: p.created_by ? p.id : null });
    setBusy(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["program"] });
    qc.invalidateQueries({ queryKey: ["profile"] });
    toast.success(`Now following ${p.name}`);
  }

  return (
    <div className="mx-auto min-h-[100dvh] max-w-lg px-5 pb-safe pt-safe">
      <header className="flex items-center gap-2 py-2">
        <button aria-label="Back" onClick={() => navigate({ to: "/me" })} className="-ml-2 p-2">
          <ChevronLeft className="h-7 w-7" />
        </button>
        <h1 className="font-display text-xl font-extrabold uppercase">Programs</h1>
      </header>

      <Link
        to="/program/import"
        className="mt-2 flex items-center gap-3 rounded-2xl border border-primary/40 bg-card p-4 active:opacity-80"
      >
        <ImagePlus className="h-6 w-6 shrink-0 text-primary" />
        <span className="min-w-0">
          <span className="block font-semibold">Import from screenshots</span>
          <span className="block text-sm text-muted-foreground">
            Turn your coach's program into a plan you can log.
          </span>
        </span>
      </Link>

      <h2 className="px-1 pb-2 pt-6 text-xs font-bold tracking-widest text-muted-foreground">
        CHOOSE A PROGRAM
      </h2>
      {list.isLoading && <p className="px-1 text-muted-foreground">Loading…</p>}
      <ul className="space-y-2">
        {list.data?.map((p) => {
          const active = p.id === current.data?.id;
          return (
            <li key={p.id}>
              <button
                onClick={() => follow(p)}
                disabled={busy !== null}
                aria-pressed={active}
                className={`flex w-full items-center gap-3 rounded-2xl bg-card p-4 text-left ${active ? "ring-2 ring-primary" : ""}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{p.name}</span>
                  <span className="block truncate text-sm text-muted-foreground">
                    {p.block_name} · {p.days} {p.days === 1 ? "day" : "days"} ·{" "}
                    {p.created_by
                      ? p.created_by === user.id
                        ? "by you"
                        : `by ${p.creator}`
                      : "Built-in"}
                  </span>
                </span>
                {active ? (
                  <Check className="h-5 w-5 shrink-0 text-primary" strokeWidth={3} />
                ) : (
                  <span className="shrink-0 text-sm font-semibold text-primary">
                    {busy === p.id ? "…" : "Follow"}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="px-1 pb-8 pt-4 text-sm text-muted-foreground">
        Your history, charts and leaderboards carry over when you switch, because they're matched by
        exercise name.
      </p>
    </div>
  );
}
