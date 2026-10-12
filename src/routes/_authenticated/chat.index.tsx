import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { format, isToday } from "date-fns";
import { PenSquare, Search, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageTitle, TabShell } from "@/components/TabShell";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { initial, useConversations } from "@/lib/chat";

export const Route = createFileRoute("/_authenticated/chat/")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Chat — NSS" },
      { name: "description", content: "Chat with the NSS Squad and message training partners." },
      { property: "og:title", content: "Chat — NSS" },
      { property: "og:description", content: "Chat with the NSS Squad and message training partners." },
    ],
  }),
  component: ChatList,
});

function preview(c: { last_kind: string | null; last_body: string | null; last_media_type: string | null }) {
  if (c.last_kind === "workout") return "🏋️ Finished a workout";
  if (c.last_media_type === "image") return c.last_body || "📷 Photo";
  if (c.last_media_type === "video") return c.last_body || "🎬 Video";
  return c.last_body || "No messages yet";
}

function ChatList() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const convs = useConversations();
  const [picker, setPicker] = useState(false);

  return (
    <TabShell>
      <div className="flex items-center justify-between pr-5">
        <PageTitle>Chat</PageTitle>
        <button onClick={() => setPicker(true)} aria-label="New message" className="flex h-11 items-center gap-2 rounded-full bg-primary px-4 font-bold text-primary-foreground active:scale-95">
          <PenSquare className="h-5 w-5" /> New
        </button>
      </div>
      <ul className="px-3">
        {(convs.data ?? []).map((c) => {
          const name = c.type === "group" ? c.name ?? "NSS Squad" : c.other_name || "Athlete";
          const t = new Date(c.last_at);
          return (
            <li key={c.id}>
              <button
                onClick={() => navigate({ to: "/chat/$conversationId", params: { conversationId: c.id } })}
                className="flex w-full items-center gap-3 rounded-2xl px-2 py-3 text-left active:bg-card"
              >
                <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-bold ${c.type === "group" ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
                  {c.type === "group" ? <Users className="h-6 w-6" /> : initial(name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-bold">{name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{c.last_body !== null || c.last_kind ? (isToday(t) ? format(t, "HH:mm") : format(t, "d MMM")) : ""}</span>
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span className={`truncate text-sm ${c.unread ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                      {c.last_sender === user.id ? "You: " : ""}
                      {preview(c)}
                    </span>
                    {c.unread > 0 && <span className="min-w-5 shrink-0 rounded-full bg-primary px-1.5 text-center text-xs font-bold leading-5 text-primary-foreground">{c.unread}</span>}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <NewMessageSheet open={picker} onClose={() => setPicker(false)} me={user.id} />
    </TabShell>
  );
}

function NewMessageSheet({ open, onClose, me }: { open: boolean; onClose: () => void; me: string }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const people = useQuery({
    queryKey: ["people"],
    enabled: open,
    queryFn: async () => (await supabase.from("profiles").select("id, display_name").neq("id", me).order("display_name")).data ?? [],
  });
  const list = useMemo(() => (people.data ?? []).filter((p) => (p.display_name ?? "Athlete").toLowerCase().includes(q.trim().toLowerCase())), [people.data, q]);

  async function startDm(id: string) {
    const { data, error } = await supabase.rpc("get_or_create_dm", { other_user_id: id });
    if (error || !data) { toast.error(error?.message ?? "Couldn't open chat"); return; }
    onClose();
    navigate({ to: "/chat/$conversationId", params: { conversationId: data } });
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" aria-describedby={undefined} className="h-[85dvh] rounded-t-3xl px-4 pt-5 pb-safe">
        <SheetTitle className="mb-3 font-display text-2xl font-extrabold uppercase">New message</SheetTitle>
        <label className="flex items-center gap-2 rounded-xl bg-card px-3">
          <Search className="h-5 w-5 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" className="h-12 flex-1 bg-transparent text-base outline-none" />
        </label>
        <ul className="mt-3 h-[calc(100%-7rem)] overflow-y-auto">
          {list.map((p) => (
            <li key={p.id}>
              <button onClick={() => startDm(p.id)} className="flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left active:bg-card">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary font-bold">{initial(p.display_name)}</span>
                <span className="font-semibold">{p.display_name || "Athlete"}</span>
              </button>
            </li>
          ))}
          {people.isSuccess && list.length === 0 && <li className="px-2 py-6 text-center text-muted-foreground">No one found</li>}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
