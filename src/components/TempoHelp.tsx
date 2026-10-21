import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Part = { label: string; text: (v: string) => string };

// Order and wording follow the "Tempo" section of the training guide.
const PARTS: Part[] = [
  {
    label: "Lower",
    text: (v) =>
      isFast(v) ? "Lower quickly, under control" : `Lower over ${secs(v)} (the stretch)`,
  },
  {
    label: "Pause",
    text: (v) => (v === "0" ? "No pause in the stretch" : `Hold ${secs(v)} in the stretch`),
  },
  {
    label: "Lift",
    text: (v) =>
      isFast(v) || v === "1" ? "Lift with intent, about 1 second" : `Lift over ${secs(v)}`,
  },
  {
    label: "Squeeze",
    text: (v) => (v === "0" ? "No pause at the top" : `Squeeze ${secs(v)} at the top`),
  },
];

const isFast = (v: string) => /^x$/i.test(v);
const secs = (v: string) => `${v} ${v === "1" ? "second" : "seconds"}`;

/**
 * "Tempo 3-0-1-0 (?)" as one button: tapping the label, the numbers or the "?" explains the
 * tempo in place, with a small link to the full guide section.
 */
export function TempoHelp({ tempo }: { tempo: string }) {
  const digits = tempo.split(/[-–\s]+/).filter(Boolean);
  const valid = digits.length === 4 && digits.every((d) => /^(\d{1,2}|x)$/i.test(d));

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          aria-label={`Tempo ${tempo}. What does it mean?`}
          className="group -my-2 inline-flex h-8 items-center gap-1 rounded-md"
        >
          <span className="text-muted-foreground">Tempo</span>
          <b className="group-data-[state=open]:text-primary">{tempo}</b>
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
        <div className="text-[11px] font-bold tracking-widest text-muted-foreground">
          TEMPO {tempo}
        </div>
        {valid ? (
          <>
            <p className="mt-1 text-sm text-muted-foreground">
              Seconds for each part of one rep, in this order:
            </p>
            <ol className="mt-3 space-y-2">
              {PARTS.map((p, i) => (
                <li key={p.label} className="flex items-center gap-3 text-sm">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-background font-display text-base font-bold text-primary">
                    {digits[i]!.toUpperCase()}
                  </span>
                  <span>{p.text(digits[i]!.toLowerCase())}</span>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <p className="mt-1 text-sm">
            How many seconds each part of a rep takes: lowering, pause, lifting, pause at the top.
          </p>
        )}
        <Link
          to="/guide/read"
          search={{ s: "tempo" }}
          className="mt-3 inline-flex items-center gap-0.5 text-xs font-semibold text-primary"
        >
          Full section in the training guide <ChevronRight className="h-3 w-3" />
        </Link>
      </PopoverContent>
    </Popover>
  );
}
