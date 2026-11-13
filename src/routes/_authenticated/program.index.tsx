import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ImagePlus } from "lucide-react";
import { ProgramList } from "@/components/ProgramPicker";

export const Route = createFileRoute("/_authenticated/program/")({
  head: () => ({
    meta: [
      { title: "Programs — HustLevel" },
      { name: "description", content: "Switch programs or import one from screenshots." },
      { property: "og:title", content: "Programs — HustLevel" },
      { property: "og:description", content: "Switch programs or import one from screenshots." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProgramsPage,
});

function ProgramsPage() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();

  return (
    <div className="mx-auto min-h-[100dvh] max-w-lg px-5 pb-safe pt-safe">
      <header className="flex items-center gap-2 py-2">
        <button aria-label="Back" onClick={() => navigate({ to: "/me" })} className="-ml-2 p-2">
          <ChevronLeft className="h-7 w-7" />
        </button>
        <h1 className="font-display text-xl font-extrabold uppercase">Programs</h1>
      </header>

      <Link
        to="/program/import"
        className="mt-2 flex items-center gap-3 rounded-2xl border border-primary/40 bg-card p-4 active:opacity-80"
      >
        <ImagePlus className="h-6 w-6 shrink-0 text-primary" />
        <span className="min-w-0">
          <span className="block font-semibold">Import from screenshots</span>
          <span className="block text-sm text-muted-foreground">
            Turn your coach's program into a plan you can log.
          </span>
        </span>
      </Link>

      <h2 className="px-1 pb-2 pt-6 text-xs font-bold tracking-widest text-muted-foreground">
        CHOOSE A PROGRAM
      </h2>
      <ProgramList userId={user.id} />
      <p className="px-1 pt-4 text-sm text-muted-foreground">
        On the current block, every block keeps its own dates: past weeks show what ran then.
        Following a previous block repeats it every week instead.
      </p>
      <p className="px-1 pb-8 pt-2 text-sm text-muted-foreground">
        Your history, charts and leaderboards carry over when you switch, because they're matched by
        exercise name.
      </p>
    </div>
  );
}
