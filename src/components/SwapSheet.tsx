import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, Undo2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cleanExerciseName } from "@/lib/swaps";
import { normKey } from "@/lib/titan";

export type SwapScope = "today" | "block";

/**
 * Replace a programmed exercise with another one. Typing suggests names the lifter has logged before
 * (and the program's exercises), so the same exercise keeps one spelling and one history.
 * Opens from the top so the phone keyboard never covers it.
 */
export function SwapSheet({
  open,
  onClose,
  programmedName,
  currentName,
  swapped,
  suggestions,
  onSwap,
  onUndo,
}: {
  open: boolean;
  onClose: () => void;
  programmedName: string;
  currentName: string;
  swapped: boolean;
  suggestions: string[];
  onSwap: (name: string, scope: SwapScope) => Promise<boolean>;
  onUndo: () => Promise<boolean>;
}) {
  const [text, setText] = useState("");
  const [scope, setScope] = useState<SwapScope>("today");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setText("");
      setScope("today");
    }
  }, [open]);

  const matches = useMemo(() => {
    const words = normKey(text).split(/\s+/).filter(Boolean);
    const skip = new Set([normKey(currentName), normKey(programmedName)]);
    return suggestions
      .filter((s) => !skip.has(normKey(s)) && words.every((w) => normKey(s).includes(w)))
      .slice(0, 6);
  }, [text, suggestions, currentName, programmedName]);

  const typed = cleanExerciseName(text);
  // Reuse the existing spelling when the typed name matches one, so history stays in one place;
  // a new name typed all in lower case gets capitalised ("good morning" → "Good Morning").
  const name =
    suggestions.find((s) => normKey(s) === normKey(typed)) ??
    (typed === typed.toLowerCase() ? typed.replace(/(^|[\s(/-])(\p{L})/gu, (_, p: string, c: string) => p + c.toUpperCase()) : typed);
  const canSwap = !!name && normKey(name) !== normKey(currentName) && !busy;

  async function run(action: () => Promise<boolean>) {
    setBusy(true);
    const ok = await action();
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="top"
        className="max-h-[85dvh] overflow-y-auto rounded-b-3xl px-5 pb-5 pt-safe"
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
      >
        <SheetTitle className="mt-4 flex items-center gap-2 pr-10 font-display text-xl font-extrabold uppercase">
          <ArrowLeftRight className="h-5 w-5 text-primary" /> Swap exercise
        </SheetTitle>
        <SheetDescription className="mt-1 text-sm">
          Instead of <b className="text-foreground">{programmedName}</b>. You keep the same sets, reps and rest,
          and your sets are saved under the exercise you actually do.
        </SheetDescription>

        {swapped && (
          <div className="mt-4 flex items-center gap-3 rounded-2xl bg-card px-4 py-3 text-sm">
            <span className="min-w-0 flex-1">
              Doing <b>{currentName}</b> instead.
            </span>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => run(onUndo)} className="shrink-0 gap-1.5">
              <Undo2 className="h-4 w-4" /> Undo swap
            </Button>
          </div>
        )}

        <form
          className="mt-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSwap) run(() => onSwap(name, scope));
          }}
        >
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={80}
            placeholder="Exercise you're doing instead"
            aria-label="Exercise you're doing instead"
            enterKeyHint="done"
            autoCapitalize="words"
            className="h-12 w-full rounded-xl border border-border bg-background px-4 text-base outline-none focus:border-primary"
          />

          {matches.length > 0 && (
            <ul className="mt-2 overflow-hidden rounded-xl bg-card" aria-label="Suggestions">
              {matches.map((m) => (
                <li key={m}>
                  <button
                    type="button"
                    onClick={() => setText(m)}
                    className={`w-full px-4 py-3 text-left text-sm font-semibold active:bg-background ${normKey(m) === normKey(typed) ? "text-primary" : ""}`}
                  >
                    {m}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl bg-card p-1" role="radiogroup" aria-label="How long">
            {(
              [
                ["today", "Today only"],
                ["block", "Rest of the block"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={scope === v}
                onClick={() => setScope(v)}
                className={`rounded-lg py-2.5 text-sm font-bold transition ${scope === v ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >
                {label}
              </button>
            ))}
          </div>

          <Button type="submit" disabled={!canSwap} className="mt-4 h-12 w-full rounded-full text-base font-bold">
            {name ? `Swap to ${name}` : "Swap"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
