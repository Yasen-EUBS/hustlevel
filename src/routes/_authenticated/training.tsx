import { rebrandText } from "@/lib/brand";
import { HustLevelLogo, HustLevelMark } from "@/components/HustLevelLogo";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { z } from "zod";
import { addDays, addMonths, format, startOfMonth, startOfWeek } from "date-fns";
import { BookOpen, Check, ChevronDown, ChevronRight, Play, Timer } from "lucide-react";
import { timers } from "@/lib/timers";
import { TabShell } from "@/components/TabShell";
import { Button } from "@/components/ui/button";
import { ExerciseVideoSheet } from "@/components/ExerciseVideo";
import { useExerciseMedia, type ExerciseMedia } from "@/lib/exercise-media";
import { supabase } from "@/integrations/supabase/client";
import { fetchActiveProgram, fetchSessions, formatDone, fromISO, isoWeekday, normKey, repText, toISO, weekOf } from "@/lib/titan";

export const Route = createFileRoute("/_authenticated/training")({
  validateSearch: z.object({ date: z.string().optional() }),
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Training — HustLevel" },
      { name: "description", content: "HustLevel — log your lifts, track your progress, level up with your crew." },
      { property: "og:title", content: "Training — HustLevel" },
      { property: "og:description", content: "HustLevel — log your lifts, track your progress, level up with your crew." },
    ],
  }),
  component: TrainingPage,
});

function TrainingPage() {
  const { date } = Route.useSearch();
  const navigate = useNavigate({ from: "/training" });
  const today = toISO(new Date());
  const selected = date ?? today;
  const sel = fromISO(selected);
  const setDate = (d: Date) => navigate({ search: { date: toISO(d) }, replace: true });

  const program = useQuery({ queryKey: ["program"], queryFn: fetchActiveProgram });
  const sessions = useQuery({ queryKey: ["sessions"], queryFn: fetchSessions });
  const media = useExerciseMedia();
  const [playing, setPlaying] = useState<ExerciseMedia | null>(null);
  const [monthOpen, setMonthOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);

  const weekStart = startOfWeek(sel, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const sessionDates = useMemo(() => new Set((sessions.data ?? []).map((s) => s.session_date)), [sessions.data]);

  const p = program.data;
  const day = p?.program_days?.find((d) => d.weekday === isoWeekday(sel));
  const session = (sessions.data ?? []).find((s) => s.session_date === selected && s.program_day_id === day?.id);
  const week = p ? weekOf(p.start_date, sel) : 0;

  // Completed sets for the selected day's session, to mark exercises done like TrainHeroic.
  const dayLogs = useQuery({
    queryKey: ["day-logs", session?.id],
    enabled: !!session?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("set_logs")
        .select("exercise_key, set_number, reps, weight_kg")
        .eq("session_id", session!.id)
        .eq("completed", true)
        .order("set_number");
      if (error) throw error;
      const byKey: Record<string, { reps: number | null; weight_kg: number | null }[]> = {};
      for (const r of data) (byKey[r.exercise_key] ??= []).push({ reps: r.reps, weight_kg: r.weight_kg });
      return byKey;
    },
  });

  const touchX = useRef<number | null>(null);

  return (
    <TabShell>
      <div className="px-5 pb-2 pt-3"><HustLevelLogo className="text-2xl" /></div>
      <header className="flex flex-wrap items-center justify-between gap-y-2 px-5 pb-3 pt-3">
        <div className="flex items-baseline gap-3">
          <button onClick={() => setMonthOpen((o) => !o)} className="flex items-center gap-1 font-display text-3xl font-extrabold uppercase">
            {format(sel, "MMM ''yy")}
            <ChevronDown className="h-6 w-6 text-primary" />
          </button>
          {selected !== today && (
            <button onClick={() => setDate(new Date())} className="text-sm font-bold text-primary">
              Today
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => timers.openSheet()} aria-label="Timers" className="flex items-center gap-1.5 rounded-full bg-card px-3 py-2 text-sm font-bold">
            <Timer className="h-4 w-4 text-primary" /> Timers
          </button>
          <Link to="/guide" className="flex items-center gap-1.5 rounded-full bg-card px-3 py-2 text-sm font-bold">
            <BookOpen className="h-4 w-4 text-primary" /> Guide
          </Link>
        </div>
      </header>
      {monthOpen && (
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-5 pb-3">
          {Array.from({ length: 13 }, (_, i) => addMonths(startOfMonth(new Date()), i - 6)).map((m) => (
            <button
              key={m.toISOString()}
              onClick={() => {
                setDate(m);
                setMonthOpen(false);
              }}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${format(m, "yyyy-MM") === format(sel, "yyyy-MM") ? "bg-primary text-primary-foreground" : "bg-card"}`}
            >
              {format(m, "MMM yy")}
            </button>
          ))}
        </div>
      )}

      <div
        className="flex px-3 pb-4"
        onTouchStart={(e) => (touchX.current = e.touches[0]!.clientX)}
        onTouchEnd={(e) => {
          if (touchX.current == null) return;
          const dx = e.changedTouches[0]!.clientX - touchX.current;
          if (Math.abs(dx) > 50) setDate(addDays(sel, dx < 0 ? 7 : -7));
          touchX.current = null;
        }}
      >
        {days.map((d) => {
          const iso = toISO(d);
          const isSel = iso === selected;
          return (
            <button key={iso} onClick={() => setDate(d)} className="flex flex-1 flex-col items-center gap-1 py-1">
              <span className="text-[11px] font-semibold uppercase text-muted-foreground">{format(d, "EEEEE")}</span>
              <span
                className={`flex h-10 w-10 items-center justify-center rounded-full text-base font-bold ${isSel ? "bg-primary text-primary-foreground" : iso === today ? "text-primary" : ""}`}
              >
                {format(d, "d")}
              </span>
              <span className={`h-1.5 w-1.5 rounded-full ${sessionDates.has(iso) ? "bg-success" : "bg-transparent"}`} />
            </button>
          );
        })}
      </div>

      {program.isLoading ? (
        <div className="px-5 text-muted-foreground">Loading…</div>
      ) : !p ? (
        <div className="px-5 text-muted-foreground">No active program.</div>
      ) : !day ? (
        <div className="mx-5 rounded-2xl bg-card p-6 text-center text-muted-foreground">No session scheduled for this day.</div>
      ) : (
        <div className="px-5">
          <div className="flex items-center gap-3">
            <HustLevelMark className="h-14 w-14" />
            <div className="min-w-0">
              <div className="truncate text-sm text-muted-foreground">{rebrandText(p.name)}</div>
              <div className="font-display text-2xl font-bold uppercase leading-tight">{day.title}</div>
            </div>
          </div>

          {session?.completed_at ? (
            <Link
              to="/history/$sessionId"
              params={{ sessionId: session.id }}
              className="mt-5 flex h-14 items-center justify-center gap-2 rounded-full bg-success text-lg font-bold text-success-foreground"
            >
              <Check className="h-5 w-5" /> Completed
            </Link>
          ) : (
            <Link
              to="/session/$dayId"
              params={{ dayId: day.id }}
              search={{ date: selected }}
              className="mt-5 flex h-14 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground"
            >
              {session ? "Resume Session" : "Start Session"}
            </Link>
          )}

          <div className="mt-5 rounded-2xl bg-card">
            <button onClick={() => setNotesOpen((o) => !o)} className="flex w-full items-center justify-between px-4 py-4 font-semibold">
              Coach Instructions
              <ChevronDown className={`h-5 w-5 text-primary transition ${notesOpen ? "rotate-180" : ""}`} />
            </button>
            {notesOpen && (
              <div className="space-y-3 px-4 pb-4 text-sm leading-relaxed text-muted-foreground">
                {week >= 1 && week <= p.total_weeks && (
                  <p className="font-semibold text-foreground">
                    This is week {week}/{p.total_weeks} – {p.block_name}
                  </p>
                )}
                {day.day_notes && <p className="text-foreground">{rebrandText(day.day_notes)}</p>}
                {p.coach_notes && <p className="whitespace-pre-line">{rebrandText(p.coach_notes)}</p>}
                {p.guide_url && (
                  <Link
                    to="/guide/read"
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-full border border-primary text-base font-bold text-primary"
                  >
                    <BookOpen className="h-5 w-5" /> Training guide
                  </Link>
                )}
              </div>
            )}
          </div>

          <ul className="mt-5 space-y-1 pb-4">
            {day.program_exercises.map((e, i) => {
              const showSection = i === 0 || day.program_exercises[i - 1]?.section !== e.section;
              const demo = media.data?.[normKey(e.name)];
              const done = dayLogs.data?.[normKey(e.name)] ?? [];
              const target = e.duration_seconds ? 1 : e.sets;
              const status = done.length === 0 ? "none" : done.length >= target ? "done" : "partial";
              return (
                <li key={e.id}>
                  {showSection && <div className="pb-2 pt-4 text-xs font-bold tracking-widest text-muted-foreground">{e.section}</div>}
                  <div className="-mx-3 flex items-center">
                  <Link
                    to="/session/$dayId"
                    params={{ dayId: day.id }}
                    search={{ date: selected, ex: i }}
                    className="flex min-w-0 flex-1 items-center gap-4 rounded-xl px-3 py-3 transition active:scale-[0.98] active:bg-card"
                  >
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                        status === "done"
                          ? "bg-success text-success-foreground"
                          : status === "partial"
                            ? "bg-partial text-primary-foreground"
                            : "border-2 border-primary"
                      }`}
                    >
                      {e.letter}
                    </span>
                    <div className="min-w-0">
                      <div className="font-semibold">{e.name}</div>
                      {status === "none" ? (
                        <div className="text-sm font-semibold text-primary">{repText(e)}</div>
                      ) : (
                        <>
                          {status === "partial" && <div className="text-sm text-muted-foreground line-through">{repText(e)}</div>}
                          <div className="text-sm font-bold text-foreground">{formatDone(done)}</div>
                        </>
                      )}
                    </div>
                    <ChevronRight className="ml-auto h-5 w-5 shrink-0 text-muted-foreground" />
                  </Link>
                  {demo && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-11 w-11 shrink-0 rounded-full text-primary active:bg-card"
                      aria-label={`Watch ${e.name} demo`}
                      title={`Watch ${e.name} demo`}
                      onClick={() => setPlaying(demo)}
                    >
                      <Play className="fill-current" />
                    </Button>
                  )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <ExerciseVideoSheet media={playing} onClose={() => setPlaying(null)} />
    </TabShell>
  );
}
