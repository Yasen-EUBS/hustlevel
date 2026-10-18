import { rebrandText } from "@/lib/brand";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { format, isSameDay, isToday, isYesterday } from "date-fns";
import { ChevronLeft, Clock, Dumbbell, Paperclip, SendHorizontal, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  IMAGE_MAX,
  REACTIONS,
  VIDEO_MAX,
  VIDEO_MAX_SECONDS,
  downscaleImage,
  initial,
  parseWorkout,
  useChatRealtime,
  useConversations,
  useSignedUrl,
  videoDuration,
} from "@/lib/chat";
import { fmtKg } from "@/lib/titan";
import { fmtClock } from "@/lib/timers";

export const Route = createFileRoute("/_authenticated/chat/$conversationId")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Conversation — HustLevel" },
      { name: "description", content: "HustLevel — log your lifts, track your progress, level up with your crew." },
      { property: "og:title", content: "Conversation — HustLevel" },
      { property: "og:description", content: "HustLevel — log your lifts, track your progress, level up with your crew." },
    ],
  }),
  component: Conversation,
});

type Msg = {
  id: string;
  sender_id: string;
  body: string;
  kind: string;
  media_path: string | null;
  media_type: string | null;
  workout_session_id: string | null;
  created_at: string;
  message_reactions: { user_id: string; emoji: string }[];
};

/** Keeps the screen sized to the visible viewport so the composer rides above the iOS keyboard. */
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

function dayLabel(d: Date) {
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "EEE d MMM");
}

function Conversation() {
  const { conversationId } = Route.useParams();
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const vp = useVisualViewport();
  useChatRealtime(`conv-${conversationId}`);

  const convs = useConversations();
  const conv = convs.data?.find((c) => c.id === conversationId);
  const title = conv ? (conv.type === "group" ? rebrandText(conv.name ?? "HustLevel Squad") : conv.other_name || "Athlete") : "";

  const names = useQuery({
    queryKey: ["conv-names", conversationId],
    queryFn: async () => {
      const { data: mem } = await supabase.from("conversation_members").select("user_id").eq("conversation_id", conversationId);
      const ids = (mem ?? []).map((m) => m.user_id);
      if (!ids.length) return {} as Record<string, string>;
      const { data } = await supabase.from("profiles").select("id, display_name").in("id", ids);
      return Object.fromEntries((data ?? []).map((p) => [p.id, p.display_name || "Athlete"])) as Record<string, string>;
    },
  });

  const msgs = useQuery({
    queryKey: ["messages", conversationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, sender_id, body, kind, media_path, media_type, workout_session_id, created_at, message_reactions(user_id, emoji)")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data as Msg[]).reverse();
    },
  });

  // Mark as read whenever new messages arrive while open.
  const lastId = msgs.data?.[msgs.data.length - 1]?.id;
  useEffect(() => {
    if (!msgs.isSuccess) return;
    supabase
      .from("conversation_members")
      .update({ last_read_at: new Date().toISOString() })
      .eq("conversation_id", conversationId)
      .eq("user_id", user.id)
      .then(() => qc.invalidateQueries({ queryKey: ["conversations"] }));
  }, [lastId, msgs.isSuccess, conversationId, user.id, qc]);

  const scroller = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastId, vp?.h]);

  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [viewer, setViewer] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function send(extra?: { media_path: string; media_type: "image" | "video" }) {
    const body = text.trim();
    if (!body && !extra) return;
    setBusy(true);
    const { error } = await supabase.from("messages").insert({ conversation_id: conversationId, sender_id: user.id, body, kind: "text", ...extra });
    setBusy(false);
    if (error) { toast.error("Couldn't send: " + error.message); return; }
    setText("");
    qc.invalidateQueries({ queryKey: ["messages", conversationId] });
  }

  async function onFile(file: File) {
    const isVideo = file.type.startsWith("video/");
    const isImage = file.type.startsWith("image/");
    if (!isVideo && !isImage) { toast.error("Pick a photo or video"); return; }
    try {
      setBusy(true);
      let blob: Blob = file;
      let ext = "jpg";
      if (isImage) {
        if (file.size > IMAGE_MAX) { toast.error("Photos can be up to 10 MB"); return; }
        blob = await downscaleImage(file);
      } else {
        if (file.size > VIDEO_MAX) { toast.error("Videos can be up to 50 MB"); return; }
        const d = await videoDuration(file);
        if (d > VIDEO_MAX_SECONDS) { toast.error("Videos can be about 60 seconds max"); return; }
        ext = (file.name.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4";
      }
      const path = `${conversationId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("chat-media").upload(path, blob, { contentType: isImage ? "image/jpeg" : file.type, upsert: false });
      if (error) { toast.error("Upload failed: " + error.message); return; }
      await send({ media_path: path, media_type: isImage ? "image" : "video" });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function toggleReaction(m: Msg, emoji: string) {
    const mine = m.message_reactions.some((r) => r.user_id === user.id && r.emoji === emoji);
    const { error } = mine
      ? await supabase.from("message_reactions").delete().eq("message_id", m.id).eq("user_id", user.id).eq("emoji", emoji)
      : await supabase.from("message_reactions").insert({ message_id: m.id, user_id: user.id, emoji });
    if (error) toast.error(error.message);
    setSelected(null);
    qc.invalidateQueries({ queryKey: ["messages", conversationId] });
  }

  async function unsend(m: Msg) {
    const { error } = await supabase.from("messages").delete().eq("id", m.id);
    if (error) { toast.error(error.message); return; }
    if (m.media_path) await supabase.storage.from("chat-media").remove([m.media_path]);
    setSelected(null);
    qc.invalidateQueries({ queryKey: ["messages", conversationId] });
    qc.invalidateQueries({ queryKey: ["conversations"] });
  }

  const list = msgs.data ?? [];
  const isGroup = conv?.type === "group";

  return (
    <div
      className="fixed inset-x-0 mx-auto flex max-w-lg flex-col bg-background"
      style={vp ? { top: vp.top, height: vp.h } : { top: 0, bottom: 0 }}
    >
      <header className="flex items-center gap-2 border-b px-2 pb-2 pt-safe">
        <button aria-label="Back to chats" onClick={() => navigate({ to: "/chat" })} className="p-2">
          <ChevronLeft className="h-7 w-7" />
        </button>
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary font-bold">{initial(title)}</span>
        <h1 className="truncate font-display text-xl font-extrabold uppercase">{title}</h1>
      </header>

      <div ref={scroller} className="flex-1 overflow-y-auto px-3 py-3" onClick={() => setSelected(null)}>
        {msgs.isSuccess && list.length === 0 && <p className="py-10 text-center text-muted-foreground">Say hi 👋</p>}
        {list.map((m, i) => {
          const d = new Date(m.created_at);
          const prev = list[i - 1];
          const newDay = !prev || !isSameDay(new Date(prev.created_at), d);
          const mine = m.sender_id === user.id;
          const showName = isGroup && !mine && (newDay || prev?.sender_id !== m.sender_id);
          return (
            <Fragment key={m.id}>
              {newDay && <div className="my-3 text-center text-xs font-bold tracking-widest text-muted-foreground">{dayLabel(d).toUpperCase()}</div>}
              <Bubble
                m={m}
                mine={mine}
                me={user.id}
                name={names.data?.[m.sender_id] ?? "Athlete"}
                showName={showName}
                selected={selected === m.id}
                onSelect={() => setSelected(m.id)}
                onReact={(e) => toggleReaction(m, e)}
                onUnsend={() => unsend(m)}
                onOpenImage={setViewer}
              />
            </Fragment>
          );
        })}
      </div>

      <form
        className="flex items-end gap-2 border-t bg-background px-3 pt-2 pb-safe"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        <button type="button" aria-label="Attach photo or video" disabled={busy} onClick={() => fileRef.current?.click()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-card disabled:opacity-50">
          <Paperclip className="h-5 w-5" />
        </button>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message"
          rows={1}
          maxLength={4000}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !("ontouchstart" in window)) {
              e.preventDefault();
              send();
            }
          }}
          className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl bg-card px-4 py-2.5 text-base outline-none ring-primary focus:ring-2"
        />
        <button type="submit" aria-label="Send" disabled={busy || !text.trim()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40">
          <SendHorizontal className="h-5 w-5" />
        </button>
      </form>

      {viewer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background" onClick={() => setViewer(null)}>
          <button aria-label="Close photo" className="absolute right-3 top-3 mt-safe rounded-full bg-card p-3">
            <X className="h-6 w-6" />
          </button>
          <img src={viewer} alt="Full-size photo" className="max-h-full max-w-full object-contain" />
        </div>
      )}
    </div>
  );
}

function useLongPress(onLong: () => void, ms = 450) {
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  const clear = () => {
    if (t.current) clearTimeout(t.current);
    t.current = null;
  };
  return {
    fired,
    handlers: {
      onTouchStart: () => {
        fired.current = false;
        clear();
        t.current = setTimeout(() => {
          fired.current = true;
          onLong();
        }, ms);
      },
      onTouchMove: clear,
      onTouchEnd: clear,
      onContextMenu: (e: React.MouseEvent) => {
        e.preventDefault();
        fired.current = true;
        onLong();
      },
    },
  };
}

function Bubble({ m, mine, me, name, showName, selected, onSelect, onReact, onUnsend, onOpenImage }: {
  m: Msg; mine: boolean; me: string; name: string; showName: boolean; selected: boolean;
  onSelect: () => void; onReact: (e: string) => void; onUnsend: () => void; onOpenImage: (url: string) => void;
}) {
  const { fired, handlers } = useLongPress(onSelect);
  const counts = useMemo(() => {
    const map = new Map<string, { n: number; mine: boolean }>();
    m.message_reactions.forEach((r) => {
      const c = map.get(r.emoji) ?? { n: 0, mine: false };
      map.set(r.emoji, { n: c.n + 1, mine: c.mine || r.user_id === me });
    });
    return [...map.entries()];
  }, [m.message_reactions, me]);
  const workout = m.kind === "workout" ? parseWorkout(m.body) : null;

  return (
    <div className={`mb-1.5 flex flex-col ${mine ? "items-end" : "items-start"}`}>
      {showName && <div className="mb-0.5 ml-3 text-xs font-bold text-muted-foreground">{name}</div>}
      <div
        {...handlers}
        onClick={(e) => {
          e.stopPropagation();
          if (fired.current) { fired.current = false; return; }
          if (!workout) onSelect();
        }}
        className={`max-w-[80%] select-none [-webkit-touch-callout:none] ${selected ? "scale-[0.98]" : ""} transition-transform`}
      >
        {workout ? (
          <Link
            to="/history/$sessionId"
            params={{ sessionId: m.workout_session_id ?? "" }}
            disabled={!m.workout_session_id}
            onClick={(e) => fired.current && e.preventDefault()}
            className="block w-72 max-w-full rounded-2xl border border-success/40 bg-card p-4 active:bg-accent"
          >
            <div className="flex items-center gap-2 text-xs font-bold tracking-widest text-success">
              <Dumbbell className="h-4 w-4" /> WORKOUT COMPLETE
            </div>
            <div className="mt-1 font-bold">{name}</div>
            <div className="font-display text-xl font-extrabold uppercase leading-tight">{workout.title}</div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-background py-2">
                <Clock className="mx-auto h-4 w-4 text-muted-foreground" />
                <div className="font-bold tabular-nums">{fmtClock(workout.duration_sec)}</div>
              </div>
              <div className="rounded-xl bg-background py-2">
                <div className="text-[10px] font-bold tracking-widest text-muted-foreground">REPS</div>
                <div className="font-bold">{workout.reps}</div>
              </div>
              <div className="rounded-xl bg-background py-2">
                <div className="text-[10px] font-bold tracking-widest text-muted-foreground">KG</div>
                <div className="font-bold">{fmtKg(workout.volume)}</div>
              </div>
            </div>
            {workout.prs.length > 0 && (
              <ul className="mt-3 space-y-1">
                {workout.prs.map((p) => (
                  <li key={p.name} className="flex items-center gap-2 text-sm font-semibold">
                    🏆 {p.name} <span className="ml-auto text-primary">{p.kg} kg</span>
                  </li>
                ))}
              </ul>
            )}
          </Link>
        ) : (
          <div className={`overflow-hidden rounded-2xl ${mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-card"}`}>
            {m.media_path && <Media path={m.media_path} type={m.media_type} onOpenImage={onOpenImage} />}
            {m.body && <p className="whitespace-pre-wrap break-words px-3.5 py-2 text-[15px] leading-snug">{m.body}</p>}
          </div>
        )}
      </div>
      <div className={`mt-0.5 flex items-center gap-1 px-1 ${mine ? "flex-row-reverse" : ""}`}>
        <span className="text-[10px] text-muted-foreground">{format(new Date(m.created_at), "HH:mm")}</span>
        {counts.map(([emoji, c]) => (
          <button
            key={emoji}
            onClick={(e) => { e.stopPropagation(); onReact(emoji); }}
            aria-label={`${emoji} ${c.n}`}
            className={`flex h-7 items-center gap-1 rounded-full px-2 text-sm ${c.mine ? "bg-primary/25 ring-1 ring-primary" : "bg-card"}`}
          >
            {emoji} <span className="text-xs font-bold">{c.n}</span>
          </button>
        ))}
        {!selected && (
          <button onClick={(e) => { e.stopPropagation(); onSelect(); }} aria-label="Add reaction" className="flex h-7 w-7 items-center justify-center rounded-full text-sm text-muted-foreground active:bg-card">
            +
          </button>
        )}
      </div>
      {selected && (
        <div className="mt-1 flex items-center gap-1 rounded-full bg-card p-1 shadow-lg" onClick={(e) => e.stopPropagation()}>
          {REACTIONS.map((r) => (
            <button key={r} aria-label={`React ${r}`} onClick={() => onReact(r)} className="h-10 w-10 rounded-full text-xl active:scale-90 active:bg-accent">
              {r}
            </button>
          ))}
          {mine && (
            <button aria-label="Unsend message" onClick={onUnsend} className="ml-1 flex h-10 items-center gap-1 rounded-full px-3 text-sm font-bold text-destructive active:bg-accent">
              <Trash2 className="h-4 w-4" /> Unsend
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Media({ path, type, onOpenImage }: { path: string; type: string | null; onOpenImage: (url: string) => void }) {
  const url = useSignedUrl(path);
  if (!url.data) return <div className="h-48 w-60 animate-pulse bg-muted" />;
  if (type === "video") {
    return <video src={url.data} controls playsInline preload="metadata" className="max-h-80 w-64 bg-background" />;
  }
  return (
    <button onClick={(e) => { e.stopPropagation(); onOpenImage(url.data!); }} aria-label="Open photo" className="block">
      <img src={url.data} alt="Shared photo" loading="lazy" className="max-h-72 w-64 object-cover" />
    </button>
  );
}
