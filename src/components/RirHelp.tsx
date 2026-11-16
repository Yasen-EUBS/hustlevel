import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// Wording follows "Reps in reserve (RIR)" in the training guide's "Words you'll see".
const SCALE = [
  { v: "0", text: "Failure: you couldn't do one more rep" },
  { v: "1–2", text: "Hard: 1 or 2 good reps left in you" },
  { v: "3–4", text: "Moderate: you could clearly do a few more" },
];

/** The program's RIR target for a date: the week-1 value during the first week, otherwise the block value. */
export function rirFor(
  program: { rir?: string | null; rir_week1?: string | null } | null | undefined,
  week: number,
): string | null {
  if (!program) return null;
  return (week === 1 && program.rir_week1) || program.rir || null;
}

/**
 * "RIR 1–2 (?)" as one button, next to Tempo: tapping it explains reps in reserve in place,
 * with the exercise's own rep range as the example and a small link to the guide.
 */
export function RirHelp({ rir, repMin, repMax }: { rir: string; repMin: number | null; repMax: number | null }) {
  // "1–2" or "1–2, last set 0": a target for every set, optionally a different one for the last set.
  const m = rir.match(/^(\d+(?:–\d+)?)(?:,\s*last set (\d+))?$/);
  const base = m?.[1] ?? null;
  const last = m?.[2] ?? null;
  const low = Number(base?.split("–")[0]);
  const high = Number(base?.split("–")[1] ?? low);
  const example =
    base && repMin
      ? `With ${repMin}${repMax && repMax !== repMin ? `–${repMax}` : ""} reps: pick a weight you could lift about ${repMin + low}${high !== low ? `–${repMin + high}` : ""} times at most. Doing ${repMin} then leaves ${base} in the tank.`
      : null;
  const highlight = new Set([base, last]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          aria-label={`RIR ${rir}. What does it mean?`}
          className="group -my-2 inline-flex h-8 items-center gap-1 rounded-md"
        >
          <span className="text-muted-foreground">RIR</span>
          <b className="group-data-[state=open]:text-primary">{rir}</b>
          <span className="ml-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border-[1.5px] border-current text-[11px] font-bold leading-none text-muted-foreground group-active:text-primary group-data-[state=open]:text-primary">
            ?
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="center"
        collisionPadding={16}
        className="w-72 rounded-2xl border-border bg-card p-4"
      >
        <div className="text-[11px] font-bold tracking-widest text-muted-foreground">RIR {rir}</div>
        <p className="mt-1 text-sm">
          <b>Reps in reserve:</b> how many more good reps you could still do when you end the set.
        </p>
        <ol className="mt-3 space-y-2">
          {SCALE.map((s) => (
            <li key={s.v} className="flex items-center gap-3 text-sm">
              <span
                className={`flex h-7 min-w-9 shrink-0 items-center justify-center rounded-lg px-1.5 font-display text-base font-bold ${highlight.has(s.v) ? "bg-primary text-primary-foreground" : "bg-background text-primary"}`}
              >
                {s.v}
              </span>
              <span>{s.text}</span>
            </li>
          ))}
        </ol>
        {last !== null && (
          <p className="mt-3 text-sm">
            <b>Every set:</b> stop with {base} reps left.{" "}
            <b>Last set:</b>{" "}
            {last === "0" ? "go to failure, until you can't do another clean rep." : `stop with ${last} reps left.`}
          </p>
        )}
        {example ? (
          <p className="mt-3 text-sm text-muted-foreground">{example}</p>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Your coach's target for this block: <b className="text-foreground">{rir}</b>.
          </p>
        )}
        <Link
          to="/guide/read"
          search={{ s: "words-you-ll-see" }}
          className="mt-3 inline-flex items-center gap-0.5 text-xs font-semibold text-primary"
        >
          More in the training guide <ChevronRight className="h-3 w-3" />
        </Link>
      </PopoverContent>
    </Popover>
  );
}
