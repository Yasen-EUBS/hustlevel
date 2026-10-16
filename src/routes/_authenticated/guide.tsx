import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BookOpen, ChevronLeft, ExternalLink, SendHorizontal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchActiveProgram } from "@/lib/titan";

export const Route = createFileRoute("/_authenticated/guide")({
  head: () => ({
    meta: [
      { title: "Training guide — NSS" },
      { name: "description", content: "Read the training guide and ask questions answered only from it." },
      { property: "og:title", content: "Training guide — NSS" },
      { property: "og:description", content: "Read the training guide and ask questions answered only from it." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GuidePage,
});

type Msg = { role: "user" | "assistant"; content: string; error?: boolean };
const SUGGESTIONS = [
  "How do I warm up?",
  "What can I do instead of Kelso shrugs?",
  "What does tempo 3-0-1-0 mean?",
  "When should I increase the weight?",
];

function useVisualViewport() {
  const [vp, setVp] = useState<{ h: number; top: number } | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    const update = () => setVp(vv ? { h: vv.height, top: vv.offsetTop } : { h: window.innerHeight, top: 0 });
    update();
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  return vp;
}

function GuidePage() {
  const navigate = useNavigate();
  const vp = useVisualViewport();
  const program = useQuery({ queryKey: ["program"], queryFn: fetchActiveProgram });
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [msgs, busy]);
  useEffect(() => () => abort.current?.abort(), []);

  async function ask(q: string) {
    const question = q.trim().slice(0, 1000);
    if (!question || busy) return;
    const history: Msg[] = [...msgs.filter((m) => !m.error), { role: "user", content: question }];
    setMsgs((m) => [...m, { role: "user", content: question }]);
    setText("");
    setBusy(true);
    const ctrl = new AbortController();
    abort.current = ctrl;
    let answer = "";
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/guide-chat", {
        method: "POST",
        signal: ctrl.signal,
        headers: { "content-type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
        body: JSON.stringify({ messages: history.slice(-10).map(({ role, content }) => ({ role, content })) }),
      });
      if (!res.ok || !res.body) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? "The guide couldn't answer right now. Try again.");
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      setMsgs((m) => [...m, { role: "assistant", content: "" }]);
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          const l = line.trim();
          if (!l.startsWith("data:")) continue;
          const payload = l.slice(5).trim();
          if (payload === "[DONE]") continue;
          try {
            const delta = JSON.parse(payload).choices?.[0]?.delta?.content;
            if (delta) {
              answer += delta;
              setMsgs((m) => [...m.slice(0, -1), { role: "assistant", content: answer }]);
            }
          } catch {
            /* partial frame */
          }
        }
      }
      if (!answer) setMsgs((m) => [...m.slice(0, -1), { role: "assistant", content: "The guide couldn't answer right now. Try again.", error: true }]);
    } catch (e) {
      if (ctrl.signal.aborted) return;
      const msg = e instanceof Error ? e.message : "Something went wrong.";
      setMsgs((m) => [...(answer || m.at(-1)?.role === "assistant" ? m.slice(0, -1) : m), { role: "assistant", content: msg, error: true }]);
    } finally {
      setBusy(false);
    }
  }

  const guideUrl = program.data?.guide_url;
  const waiting = busy && msgs.at(-1)?.role !== "assistant";

  return (
    <div className="fixed inset-x-0 mx-auto flex max-w-lg flex-col bg-background" style={vp ? { top: vp.top, height: vp.h } : { top: 0, bottom: 0 }}>
      <header className="flex items-center gap-2 border-b px-2 pb-2 pt-safe">
        <button aria-label="Back to Training" onClick={() => navigate({ to: "/training" })} className="p-2">
          <ChevronLeft className="h-7 w-7" />
        </button>
        <h1 className="flex-1 truncate font-display text-xl font-extrabold uppercase">Training guide</h1>
        {msgs.length > 0 && (
          <button
            onClick={() => {
              abort.current?.abort();
              setMsgs([]);
              setBusy(false);
            }}
            className="rounded-full px-3 py-2 text-sm font-bold text-primary"
          >
            Clear
          </button>
        )}
      </header>

      <div ref={scroller} className="flex-1 overflow-y-auto px-3 py-3">
        {guideUrl && (
          <a href={guideUrl} target="_blank" rel="noopener" className="flex items-center gap-3 rounded-2xl bg-card p-4 font-semibold">
            <BookOpen className="h-6 w-6 text-primary" />
            <span className="flex-1">Open full guide (PDF)</span>
            <ExternalLink className="h-5 w-5 text-muted-foreground" />
          </a>
        )}
        <h2 className="px-1 pb-2 pt-5 text-xs font-bold tracking-widest text-muted-foreground">ASK THE GUIDE</h2>
        {msgs.length === 0 && (
          <div className="flex flex-wrap gap-2 px-1">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => ask(s)} className="rounded-full border border-primary px-4 py-2 text-sm font-semibold text-primary active:bg-card">
                {s}
              </button>
            ))}
          </div>
        )}
        <div className="space-y-2">
          {msgs.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-primary-foreground">{m.content}</div>
              </div>
            ) : (
              <div key={i} className="flex justify-start">
                <div className={`guide-md max-w-[88%] rounded-2xl rounded-bl-md bg-card px-3.5 py-2 text-sm leading-relaxed ${m.error ? "text-muted-foreground" : ""}`}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content || "…"}</ReactMarkdown>
                </div>
              </div>
            ),
          )}
          {waiting && (
            <div className="flex justify-start" aria-label="Guide is typing">
              <div className="flex gap-1 rounded-2xl rounded-bl-md bg-card px-4 py-3">
                {[0, 150, 300].map((d) => (
                  <span key={d} className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: `${d}ms` }} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <form
        className="flex items-end gap-2 border-t bg-background px-3 pt-2"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
        onSubmit={(e) => {
          e.preventDefault();
          ask(text);
        }}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ask about the guide"
          rows={1}
          maxLength={1000}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !("ontouchstart" in window)) {
              e.preventDefault();
              ask(text);
            }
          }}
          className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl bg-card px-4 py-2.5 text-base outline-none"
        />
        <button type="submit" aria-label="Send" disabled={busy || !text.trim()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-50">
          <SendHorizontal className="h-5 w-5" />
        </button>
      </form>
    </div>
  );
}
