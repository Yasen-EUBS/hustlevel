import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageTitle, TabShell } from "@/components/TabShell";

export const Route = createFileRoute("/_authenticated/me")({
  head: () => ({
    meta: [
      { title: "Me — Titan Log" },
      { name: "description", content: "Your Titan Log account." },
      { property: "og:title", content: "Me — Titan Log" },
      { property: "og:description", content: "Your Titan Log account." },
    ],
  }),
  component: MePage,
});

function MePage() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const profile = useQuery({
    queryKey: ["profile", user.id],
    queryFn: async () => (await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle()).data,
  });
  const [name, setName] = useState("");
  useEffect(() => setName(profile.data?.display_name ?? ""), [profile.data]);

  async function save() {
    const { error } = await supabase.from("profiles").upsert({ id: user.id, display_name: name.trim() || null });
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["profile"] });
    toast.success("Saved");
  }

  return (
    <TabShell>
      <PageTitle>Me</PageTitle>
      <div className="space-y-3 px-5">
        <div className="rounded-2xl bg-card p-4">
          <label className="text-[11px] font-bold tracking-widest text-muted-foreground">DISPLAY NAME</label>
          <input value={name} onChange={(e) => setName(e.target.value)} onBlur={save} className="mt-1 w-full bg-transparent text-lg font-semibold outline-none" />
        </div>
        <div className="rounded-2xl bg-card p-4">
          <div className="text-[11px] font-bold tracking-widest text-muted-foreground">EMAIL</div>
          <div className="mt-1 text-lg font-semibold">{user.email}</div>
        </div>
        <div className="rounded-2xl bg-card p-4">
          <div className="text-[11px] font-bold tracking-widest text-muted-foreground">UNITS</div>
          <div className="mt-1 text-lg font-semibold">Kilograms (kg)</div>
          <p className="text-sm text-muted-foreground">All weights are logged and shown in kg.</p>
        </div>
        <button onClick={() => supabase.auth.signOut()} className="mt-4 h-14 w-full rounded-full border border-destructive font-bold text-destructive">
          Sign out
        </button>
      </div>
    </TabShell>
  );
}
