import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Check, ChevronLeft, ImagePlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchActiveProgram, fromISO } from "@/lib/titan";

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
  is_active: boolean;
  start_date: string;
  total_weeks: number;
  days: number;
  creator: string | null;
};

// Built-in blocks that are no longer the default stay listed as "Previous block" so anyone can go back to one.
const rank = (p: Listed) => (p.created_by ? 2 : p.is_active ? 0 : 1);

/** "7 Sep – 1 Nov": the block's first and last day. */
function blockDates(p: Listed) {
  const start = fromISO(p.start_date);
  const end = new Date(start);
  end.setDate(end.getDate() + p.total_weeks * 7 - 1);
  const f = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${f(start)} – ${f(end)}`;
}

async function fetchPrograms(): Promise<Listed[]> {
  const { data, error } = await supabase
    .from("programs")
    .select(
      "id, name, block_name, created_by, created_at, is_active, start_date, total_weeks, program_days(id)",
    )
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
      is_active: p.is_active,
      start_date: p.start_date,
      total_weeks: p.total_weeks,
      days: p.program_days.length,
      creator: p.created_by
        ? (names.find((n) => n.id === p.created_by)?.display_name ?? "Athlete")
        : null,
    }))
    .sort((a, b) => rank(a) - rank(b)); // current built-in, previous built-ins, then imports (newest first)
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
    // A previous built-in block or an imported program is pinned by id.
    const pinned = p.created_by !== null || !p.is_active;
    const { error } = await supabase
      .from("profiles")
      .upsert({ id: user.id, program_id: pinned ? p.id : null });
    setBusy(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["program"] });
    qc.invalidateQueries({ queryKey: ["profile"] });
    toast.success(
      p.created_by
        ? `Now following ${p.name}`
        : p.is_active
          ? "Back on the current block"
          : `Switched to ${p.block_name}`,
    );
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
                    {p.created_by ? (
                      <>
                        {p.block_name} · {p.days} {p.days === 1 ? "day" : "days"} ·{" "}
                        {p.created_by === user.id ? "by you" : `by ${p.creator}`}
                      </>
                    ) : (
                      <>
                        {p.block_name} · {blockDates(p)}
                      </>
                    )}
                  </span>
                  {!p.created_by && (
                    <span
                      className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold tracking-wide ${p.is_active ? "bg-primary/15 text-primary" : "bg-background text-muted-foreground"}`}
                    >
                      {p.is_active ? "CURRENT BLOCK" : "PREVIOUS BLOCK"}
                    </span>
                  )}
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
