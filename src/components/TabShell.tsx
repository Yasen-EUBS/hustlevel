import { Link } from "@tanstack/react-router";
import { Dumbbell, History, TrendingUp, User } from "lucide-react";
import type { ReactNode } from "react";

const tabs = [
  { to: "/training", label: "Training", icon: Dumbbell },
  { to: "/history", label: "History", icon: History },
  { to: "/progress", label: "Progress", icon: TrendingUp },
  { to: "/me", label: "Me", icon: User },
] as const;

export function TabShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto min-h-[100dvh] max-w-lg pt-safe">
      <main className="pb-28">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur pb-safe">
        <div className="mx-auto flex max-w-lg">
          {tabs.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-semibold text-muted-foreground"
              activeProps={{ className: "text-primary" }}
            >
              <Icon className="h-6 w-6" />
              {label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}

export function PageTitle({ children }: { children: ReactNode }) {
  return <h1 className="px-5 pb-4 pt-3 font-display text-4xl font-extrabold uppercase tracking-tight">{children}</h1>;
}
