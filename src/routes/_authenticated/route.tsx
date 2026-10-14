import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// Reads the session stored on the device instead of calling the auth server on
// every navigation. A network call here (getUser) failed on flaky mobile
// connections and when the home-screen app resumed from the background, which
// crashed the page. Data access is still enforced server-side by RLS.
async function readSession(): Promise<Session | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { data } = await supabase.auth.getSession();
      return data.session;
    } catch (err) {
      // Supabase can throw transiently (e.g. auth lock contention right after resume).
      if (attempt === 1) throw err;
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  return null;
}

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const session = await readSession();
    if (!session?.user) throw redirect({ to: "/auth" });
    return { user: session.user };
  },
  component: () => <Outlet />,
});
