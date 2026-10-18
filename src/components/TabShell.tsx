import { Link } from "@tanstack/react-router";
import { Dumbbell, History, MessageCircle, TrendingUp, User } from "lucide-react";
import { HustLevelLogo } from "@/components/HustLevelLogo";
import type { ReactNode } from "react";
import { MiniTimer, TimerSheet } from "@/components/Timers";
import { InstallPrompt } from "@/components/InstallBanner";
import { useChatRealtime, useConversations } from "@/lib/chat";

const tabs = [
  { to: "/training", label: "Training", icon: Dumbbell },
  { to: "/history", label: "History", icon: History },
  { to: "/progress", label: "Progress", icon: TrendingUp },
  { to: "/chat", label: "Chat", icon: MessageCircle },
  { to: "/me", label: "Me", icon: User },
] as const;

export function TabShell({ children }: { children: ReactNode }) {
  const convs = useConversations();
  useChatRealtime("tabs");
  const unread = (convs.data ?? []).reduce((n, c) => n + (c.unread ?? 0), 0);
  return (
    <div className="mx-auto min-h-[100dvh] max-w-lg pt-safe">
      <main className="pb-28">{children}</main>
      <div className="fixed inset-x-0 bottom-[calc(7.5rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-lg justify-start px-4 pointer-events-none">
        <div className="pointer-events-auto">
          <InstallPrompt variant="banner" />
        </div>
      </div>
      <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-lg justify-end px-4 pointer-events-none">
        <div className="pointer-events-auto">
          <MiniTimer className="shadow-lg" />
        </div>
      </div>
      <TimerSheet />
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur pb-safe">
        <div className="mx-auto flex max-w-lg">
          {tabs.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-semibold text-muted-foreground"
              activeProps={{ className: "text-primary" }}
            >
              <Icon className="h-6 w-6" />
              {label}
              {to === "/chat" && unread > 0 && (
                <span aria-label={`${unread} unread`} className="absolute left-1/2 top-1 ml-2 min-w-5 rounded-full bg-destructive px-1.5 text-center text-[11px] font-bold leading-5 text-destructive-foreground">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}

export function PageTitle({ children }: { children: ReactNode }) {
  return <div className="px-5 pb-4 pt-3"><HustLevelLogo className="mb-4 text-xl" /><h1 className="font-display text-4xl font-extrabold uppercase">{children}</h1></div>;
}
