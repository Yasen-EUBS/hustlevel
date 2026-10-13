import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BookOpen, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageTitle, TabShell } from "@/components/TabShell";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/me")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Me — NSS" },
      { name: "description", content: "Your NSS account." },
      { property: "og:title", content: "Me — NSS" },
      { property: "og:description", content: "Your NSS account." },
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
  const program = useQuery({
    queryKey: ["program"],
    queryFn: async () =>
      (await supabase.from("programs").select("guide_url").eq("is_active", true).limit(1).maybeSingle()).data,
  });
  const [name, setName] = useState("");
  useEffect(() => {
    setName(profile.data?.display_name ?? "");
  }, [profile.data]);

  async function save() {
    const { error } = await supabase.from("profiles").upsert({ id: user.id, display_name: name.trim() || null });
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["profile"] });
    toast.success("Saved");
  }

  return (
    <TabShell>
      <PageTitle>Me</PageTitle>
      <div className="space-y-3 px-5">
        {profile.isSuccess && !profile.data?.display_name && (
          <div className="rounded-2xl bg-accent p-4 text-sm">
            <b>Add a display name</b> so friends can see you on leaderboards. Until then you show up as "Athlete".
          </div>
        )}
        <div className="rounded-2xl bg-card p-4">
          <label className="text-[11px] font-bold tracking-widest text-muted-foreground">DISPLAY NAME</label>
          <input value={name} onChange={(e) => setName(e.target.value)} onBlur={save} placeholder="Athlete" maxLength={40} className="mt-1 w-full bg-transparent text-lg font-semibold outline-none placeholder:text-muted-foreground" />
        </div>
        <div className="rounded-2xl bg-card p-4">
          <div className="text-[11px] font-bold tracking-widest text-muted-foreground">EMAIL</div>
          <div className="mt-1 text-lg font-semibold">{user.email}</div>
        </div>
        <label className="flex items-center justify-between gap-4 rounded-2xl bg-card p-4">
          <span>
            <span className="block font-semibold">Share finished workouts to NSS Squad</span>
            <span className="text-sm text-muted-foreground">Posts a summary card when you tap Finish.</span>
          </span>
          <Switch
            checked={profile.data?.share_workouts ?? true}
            onCheckedChange={async (v) => {
              const { error } = await supabase.from("profiles").update({ share_workouts: v }).eq("id", user.id);
              if (error) toast.error(error.message);
              qc.invalidateQueries({ queryKey: ["profile"] });
            }}
          />
        </label>
        <div className="rounded-2xl bg-card p-4">
          <div className="text-[11px] font-bold tracking-widest text-muted-foreground">UNITS</div>
          <div className="mt-1 text-lg font-semibold">Kilograms (kg)</div>
          <p className="text-sm text-muted-foreground">All weights are logged and shown in kg.</p>
        </div>
        {program.data?.guide_url && (
          <a
            href={program.data.guide_url}
            target="_blank"
            rel="noopener"
            className="flex h-14 items-center justify-between gap-3 rounded-2xl bg-card px-4"
          >
            <span className="flex items-center gap-3">
              <BookOpen className="h-5 w-5 text-primary" />
              <span className="font-semibold">Training guide</span>
            </span>
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
          </a>
        )}
        <button onClick={() => supabase.auth.signOut()} className="mt-4 h-14 w-full rounded-full border border-destructive font-bold text-destructive">
          Sign out
        </button>
      </div>
    </TabShell>
  );
}
