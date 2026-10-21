import { rebrandText } from "@/lib/brand";
import { createFileRoute, useCanGoBack, useNavigate, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Children, isValidElement, useEffect, type ReactNode } from "react";
import { z } from "zod";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChevronLeft, Share } from "lucide-react";
import { fetchActiveProgram } from "@/lib/titan";
import guide from "../../../supabase/functions/guide-chat/guide.md?raw";

// The full guide rendered inside the app. Opening the PDF directly trapped the
// iPhone home-screen app on a page with no back button (and Android's WebView
// can't show PDFs), so the guide is shown here with the app's own navigation.
export const Route = createFileRoute("/_authenticated/guide_/read")({
  // ?s=tempo opens the guide scrolled to that heading (e.g. from the tempo "?" in a session).
  validateSearch: z.object({ s: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Full training guide — HustLevel" },
      { name: "description", content: "HustLevel — log your lifts, track your progress, level up with your crew." },
      { property: "og:title", content: "Full training guide — HustLevel" },
      { property: "og:description", content: "HustLevel — log your lifts, track your progress, level up with your crew." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GuideReader,
});

// Drop the document title; the screen header already names it.
const BODY = rebrandText(guide).replace(/^# .*\n/, "");
const SECTIONS = [...BODY.matchAll(/^# (.+)$/gm)].map((m) => m[1]!.trim());

function textOf(node: ReactNode): string {
  return Children.toArray(node)
    .map((c) =>
      typeof c === "string" || typeof c === "number"
        ? String(c)
        : isValidElement<{ children?: ReactNode }>(c)
          ? textOf(c.props.children)
          : "",
    )
    .join("");
}
const slug = (s: string) =>
  "g-" +
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function GuideReader() {
  const navigate = useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  // Return to wherever the guide was opened from (Training, Me or the Guide tab).
  const goBack = () => (canGoBack ? router.history.back() : navigate({ to: "/guide" }));
  const program = useQuery({ queryKey: ["program"], queryFn: fetchActiveProgram });
  const pdfUrl = program.data?.guide_url;
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const jump = (title: string) =>
    document.getElementById(slug(title))?.scrollIntoView({ behavior: "smooth", block: "start" });

  const { s: section } = Route.useSearch();
  useEffect(() => {
    if (!section) return undefined;
    // Wait for the router's scroll restoration (which resets to the top) before jumping.
    const t = window.setTimeout(
      () => document.getElementById(slug(section))?.scrollIntoView({ block: "start" }),
      120,
    );
    return () => window.clearTimeout(t);
  }, [section]);

  return (
    <div className="mx-auto min-h-[100dvh] max-w-lg bg-background pb-safe">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background/95 px-2 pb-2 pt-safe backdrop-blur">
        <button aria-label="Back" onClick={goBack} className="p-2">
          <ChevronLeft className="h-7 w-7" />
        </button>
        <h1 className="flex-1 truncate font-display text-xl font-extrabold uppercase">
          Full guide
        </h1>
        {pdfUrl && canShare && (
          <button
            aria-label="Share or save PDF"
            onClick={() =>
              navigator.share({ title: "HustLevel training guide", url: pdfUrl }).catch(() => undefined)
            }
            className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-bold text-primary"
          >
            <Share className="h-4 w-4" /> PDF
          </button>
        )}
      </header>

      <nav className="px-4 pt-4">
        <div className="text-xs font-bold tracking-widest text-muted-foreground">CONTENTS</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {SECTIONS.map((s) => (
            <button
              key={s}
              onClick={() => jump(s)}
              className="rounded-full bg-card px-3 py-1.5 text-left text-sm font-semibold"
            >
              {s.replace(/:.*$/, "").replace(/ \(FAQ\)$/, "")}
            </button>
          ))}
        </div>
      </nav>

      <article className="guide-md guide-doc px-4 pb-10 pt-2 text-[15px] leading-relaxed">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => (
              <h2 id={slug(textOf(children))} className="scroll-mt-20">
                {children}
              </h2>
            ),
            h2: ({ children }) => (
              <h3 id={slug(textOf(children))} className="scroll-mt-20">
                {children}
              </h3>
            ),
            a: ({ children, href }) => (
              <a href={href} target="_blank" rel="noopener" className="text-primary underline">
                {children}
              </a>
            ),
          }}
        >
          {BODY}
        </ReactMarkdown>
      </article>
    </div>
  );
}
