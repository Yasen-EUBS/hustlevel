/** Hours + minutes inputs for editing a workout's duration. Values are strings so fields can be empty while typing. */
export function DurationEditor({
  hours,
  minutes,
  onChange,
}: {
  hours: string;
  minutes: string;
  onChange: (next: { hours: string; minutes: string }) => void;
}) {
  const field =
    "h-14 w-16 rounded-xl bg-background text-center font-display text-3xl font-bold outline-none ring-primary focus:ring-2";
  return (
    <div className="flex items-end gap-2">
      <label className="flex flex-col items-center gap-1">
        <input
          aria-label="Hours"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          value={hours}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => onChange({ hours: e.target.value.replace(/[^0-9]/g, ""), minutes })}
          className={field}
        />
        <span className="text-[11px] font-bold tracking-widest text-muted-foreground">H</span>
      </label>
      <span className="pb-6 font-display text-3xl font-bold">:</span>
      <label className="flex flex-col items-center gap-1">
        <input
          aria-label="Minutes"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={2}
          value={minutes}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            const v = e.target.value.replace(/[^0-9]/g, "");
            onChange({ hours, minutes: v === "" ? "" : String(Math.min(59, Number(v))) });
          }}
          className={field}
        />
        <span className="text-[11px] font-bold tracking-widest text-muted-foreground">MIN</span>
      </label>
    </div>
  );
}

export function toDurationParts(totalSec: number) {
  const mins = Math.max(0, Math.round(totalSec / 60));
  return { hours: String(Math.floor(mins / 60)), minutes: String(mins % 60).padStart(2, "0") };
}

export function fromDurationParts(p: { hours: string; minutes: string }) {
  return ((Number(p.hours) || 0) * 60 + (Number(p.minutes) || 0)) * 60;
}

export function formatDuration(totalSec: number) {
  const mins = Math.max(0, Math.round(totalSec / 60));
  const h = Math.floor(mins / 60);
  return h > 0 ? `${h}h ${String(mins % 60).padStart(2, "0")}m` : `${mins} min`;
}
