import { cn } from "@/lib/utils";

export function HustLevelMark({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 620 580" aria-hidden="true" className={cn("shrink-0", className)}>
      <polyline points="60,290 310,85 560,290" fill="none" stroke="var(--secondary-accent)" strokeWidth="110" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="60,495 310,290 560,495" fill="none" stroke="var(--primary)" strokeWidth="110" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function HustLevelLogo({ className }: { className?: string }) {
  return (
    <span className={cn("hustlevel-logo inline-flex max-w-full items-center gap-2.5 font-extrabold leading-none", className)} aria-label="HustLevel">
      <HustLevelMark className="h-[0.85em] w-[0.91em]" />
      <span aria-hidden="true"><span className="text-foreground">Hust</span><span className="text-primary">Level</span></span>
    </span>
  );
}