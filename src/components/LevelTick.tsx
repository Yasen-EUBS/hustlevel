import { cn } from "@/lib/utils";

/**
 * Completed-set mark: the HustLevel chevrons rising into place ("level up").
 * Same geometry and colours as HustLevelMark; the rise animation lives in styles.css.
 */
export function LevelTick({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 620 580"
      aria-hidden="true"
      className={cn("level-tick shrink-0", className)}
    >
      <polyline
        className="level-tick-back"
        points="60,290 310,85 560,290"
        fill="none"
        stroke="var(--secondary-accent)"
        strokeWidth="110"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        className="level-tick-front"
        points="60,495 310,290 560,495"
        fill="none"
        stroke="var(--primary)"
        strokeWidth="110"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
