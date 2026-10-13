import nssLogo from "@/assets/nss-logo.png";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Sign in — NSS" },
      { name: "description", content: "Sign in or create your NSS account." },
      { property: "og:title", content: "Sign in — NSS" },
      { property: "og:description", content: "Sign in or create your NSS account." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "up" && !name.trim()) {
      toast.error("Please enter a display name.");
      return;
    }
    setBusy(true);
    const res =
      mode === "in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: window.location.origin, data: { display_name: name.trim() } },
          });
    setBusy(false);
    if (res.error) { toast.error(res.error.message); return; }
    if (!res.data.session) { toast.success("Check your email to confirm your account."); return; }
    navigate({ to: "/training" });
  }

  const field = "h-14 w-full rounded-xl bg-card px-4 text-base text-foreground placeholder:text-muted-foreground outline-none ring-primary focus:ring-2";

  return (
    <div className="flex min-h-[100dvh] flex-col justify-center px-6 pt-safe pb-safe">
      <img src={nssLogo} alt="NSS logo" width={72} height={72} className="mb-6 rounded-2xl" />
      <h1 className="font-display text-5xl font-extrabold uppercase tracking-tight">NSS</h1>
      <p className="mt-2 text-muted-foreground">{mode === "in" ? "Welcome back. Time to lift." : "Create your account."}</p>
      <form onSubmit={submit} className="mt-8 space-y-3">
        {mode === "up" && <input className={field} placeholder="Display name" required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />}
        <input className={field} type="email" autoComplete="email" placeholder="Email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className={field} type="password" autoComplete={mode === "in" ? "current-password" : "new-password"} placeholder="Password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
        <button disabled={busy} className="h-14 w-full rounded-full bg-primary text-lg font-bold text-primary-foreground disabled:opacity-60">
          {busy ? "…" : mode === "in" ? "Log in" : "Sign up"}
        </button>
      </form>
      <button onClick={() => setMode(mode === "in" ? "up" : "in")} className="mt-6 py-3 text-center text-sm text-muted-foreground">
        {mode === "in" ? "No account? " : "Have an account? "}
        <span className="font-semibold text-primary">{mode === "in" ? "Sign up" : "Log in"}</span>
      </button>
      <InstallPrompt variant="card" />
    </div>
  );
}
