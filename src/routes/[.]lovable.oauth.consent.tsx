import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { HustLevelLogo } from "@/components/HustLevelLogo";
import { Button } from "@/components/ui/button";

type OAuthDetails = { client?: { name?: string; client_name?: string } | null; redirect_uri?: string; redirect_url?: string; redirect_to?: string; scope?: string; user?: { email?: string } } | null;
type OAuthResult = { data: OAuthDetails; error: { message: string } | null };
type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<OAuthResult>;
  approveAuthorization: (id: string) => Promise<OAuthResult>;
  denyAuthorization: (id: string) => Promise<OAuthResult>;
};
const oauth = () => (supabase.auth as unknown as { oauth: OAuthApi }).oauth;

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  head: () => ({ meta: [{ title: "Connect an app — HustLevel" }, { name: "robots", content: "noindex" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s["authorization_id"] === "string" ? s["authorization_id"] : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("This connection link is missing its authorization. Start again from your assistant.");
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth", search: { next: location.pathname + location.searchStr } });
  },
  loaderDeps: ({ search }) => ({ id: search.authorization_id }),
  loader: async ({ deps }) => {
    const { data, error } = await oauth().getAuthorizationDetails(deps.id);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    const { data: s } = await supabase.auth.getSession();
    return { details: data, email: s.session?.user.email ?? "" };
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="flex min-h-[100dvh] flex-col justify-center px-6">
      <HustLevelLogo className="text-3xl" />
      <p className="mt-6 text-foreground">Could not load this connection request.</p>
      <p className="mt-2 text-sm text-muted-foreground">{error instanceof Error ? error.message : String(error)}</p>
    </main>
  ),
});

function Consent() {
  const { details, email } = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const client = details?.client?.name ?? details?.client?.client_name ?? "An app";
  const scopes = (details?.scope ?? "").split(/\s+/).filter(Boolean);
  const label = (s: string) => s === "openid" ? "Confirm your identity" : s === "email" ? "Share your email address" : s === "profile" ? "Share your basic profile" : `Additional permission requested: ${s}`;

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    try {
      const { data, error } = approve ? await oauth().approveAuthorization(authorization_id) : await oauth().denyAuthorization(authorization_id);
      if (error) throw new Error(error.message);
      const target = data?.redirect_url ?? data?.redirect_to;
      if (!target) throw new Error("No redirect was returned. Please try again.");
      window.location.href = target;
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <main className="flex min-h-[100dvh] flex-col justify-center px-6 pt-safe pb-safe">
      <HustLevelLogo className="text-3xl" />
      <h1 className="mt-8 text-2xl font-bold text-foreground">Connect {client} to HustLevel</h1>
      <p className="mt-3 text-muted-foreground">{client} will be able to read your workouts, exercise history and meal logs as you.</p>
      <div className="mt-6 space-y-2 rounded-xl border border-border bg-card p-4 text-sm">
        {email && <p className="text-foreground">Signed in as <span className="font-semibold">{email}</span></p>}
        {details?.redirect_uri && <p className="break-all text-muted-foreground">Returns to {details.redirect_uri}</p>}
        {scopes.map((s) => <p key={s} className="text-foreground">• {label(s)}</p>)}
        <p className="pt-2 text-muted-foreground">This does not bypass this app's permissions.</p>
      </div>
      {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
      <Button disabled={busy} onClick={() => decide(true)} className="mt-6 h-14 rounded-full text-lg font-bold">Approve</Button>
      <Button disabled={busy} variant="ghost" onClick={() => decide(false)} className="mt-2 h-12 text-muted-foreground">Cancel connection</Button>
    </main>
  );
}
