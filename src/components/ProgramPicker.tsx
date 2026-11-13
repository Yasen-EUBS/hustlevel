import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { Check, ChevronDown, ImagePlus } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { fetchActiveProgram, fromISO } from "@/lib/titan";

// The program list and "follow" action, shared by the Programs page (from Me) and the switcher on Training.

export type ListedProgram = {
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
const rank = (p: ListedProgram) => (p.created_by ? 2 : p.is_active ? 0 : 1);

/** "7 Sep – 1 Nov": the block's first and last day. */
function blockDates(p: ListedProgram) {
  const start = fromISO(p.start_date);
  const end = new Date(start);
  end.setDate(end.getDate() + p.total_weeks * 7 - 1);
  const f = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${f(start)} – ${f(end)}`;
}

export async function fetchPrograms(): Promise<ListedProgram[]> {
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

/** Every program, with the one being followed marked; tapping another one follows it. */
export function ProgramList({ userId, onSwitched }: { userId: string; onSwitched?: () => void }) {
  const qc = useQueryClient();
  const current = useQuery({ queryKey: ["program"], queryFn: fetchActiveProgram });
  const list = useQuery({ queryKey: ["programs-list"], queryFn: fetchPrograms });
  const [busy, setBusy] = useState<string | null>(null);

  async function follow(p: ListedProgram) {
    if (p.id === current.data?.id) return;
    setBusy(p.id);
    // NULL means "the built-in default", so it follows future default blocks automatically.
    // A previous built-in block or an imported program is pinned by id.
    const pinned = p.created_by !== null || !p.is_active;
    const { error } = await supabase
      .from("profiles")
      .upsert({ id: userId, program_id: pinned ? p.id : null });
    setBusy(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["program"] });
    qc.invalidateQueries({ queryKey: ["program-timeline"] });
    qc.invalidateQueries({ queryKey: ["profile"] });
    toast.success(
      p.created_by
        ? `Now following ${p.name}`
        : p.is_active
          ? "Back on the current block"
          : `Switched to ${p.block_name}`,
    );
    onSwitched?.();
  }

  if (list.isLoading) return <p className="px-1 text-muted-foreground">Loading…</p>;

  return (
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
                      {p.created_by === userId ? "by you" : `by ${p.creator}`}
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
                <span className="shrink-0 text-sm font-semibold text-primary">{busy === p.id ? "…" : "Follow"}</span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** The program name as a button: tapping it opens the program list in a sheet, right where you train. */
export function ProgramSwitcher({ label, userId }: { label: string; userId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`${label}. Switch program`}
        className="-mx-1 inline-flex max-w-full items-center gap-1 rounded-md px-1 text-sm text-muted-foreground active:text-foreground"
      >
        <span className="truncate">{label}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-primary" strokeWidth={2.5} />
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-3xl px-5 pb-safe pt-6">
          <SheetTitle className="font-display text-xl font-extrabold uppercase">Switch program</SheetTitle>
          <SheetDescription className="mt-1 text-sm">
            Your history, charts and leaderboards carry over when you switch.
          </SheetDescription>
          <div className="mt-4">
            <ProgramList userId={userId} onSwitched={() => setOpen(false)} />
          </div>
          <Link
            to="/program/import"
            onClick={() => setOpen(false)}
            className="mb-4 mt-4 flex items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold text-primary active:bg-card"
          >
            <ImagePlus className="h-4 w-4" /> Import a program from screenshots
          </Link>
        </SheetContent>
      </Sheet>
    </>
  );
}
