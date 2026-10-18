// Server-only helpers for the /api/* routes. Never import from client components.
import { createClient } from "@supabase/supabase-js";
import { GatewayError, generateChatCompletion } from "@lovable.dev/ai-gateway";
import type { Database } from "@/integrations/supabase/types";

export const MODEL = "google/gemini-3.8-flash";

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
export const fail = (status: number, error: string) => json(status, { error });

/** Supabase client acting as the signed-in caller (RLS applies), plus their user id. */
export async function userFromRequest(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token || token.split(".").length !== 3) return null;
  const url = process.env["SUPABASE_URL"]!;
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const sb = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: `Bearer ${token}` },
      fetch: (i, init) => {
        const h = new Headers(init?.headers);
        h.set("apikey", key);
        return fetch(i, { ...init, headers: h });
      },
    },
  });
  const { data: claims, error } = await sb.auth.getClaims(token);
  const userId = claims?.claims?.sub;
  if (error || !userId) return null;
  return { sb, userId };
}

type Sb = NonNullable<Awaited<ReturnType<typeof userFromRequest>>>["sb"];

/** Logs one AI call and refuses when the caller is over `limit` calls of this kind in 24 h. */
export async function takeQuota(
  sb: Sb,
  userId: string,
  kind: "program_import" | "coach_summary",
  limit: number,
) {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await sb
    .from("ai_calls")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("kind", kind)
    .gte("created_at", since);
  if ((count ?? 0) >= limit) return false;
  await sb.from("ai_calls").insert({ user_id: userId, kind });
  return true;
}

type Content =
  string | ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } })[];

export async function complete(opts: {
  system: string;
  user: Content;
  maxTokens: number;
  json?: boolean;
  signal?: AbortSignal;
}): Promise<{ ok: true; text: string } | { ok: false; status: number; error: string }> {
  let data;
  try {
    data = await generateChatCompletion({
      model: MODEL,
      max_completion_tokens: opts.maxTokens,
      // Keep short coach answers from spending their output budget on hidden reasoning.
      ...(!opts.json ? { reasoning_effort: "minimal" as const } : {}),
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
    }, { ...(opts.signal ? { signal: opts.signal } : {}), maxRetries: 0 });
  } catch (error) {
    if (error instanceof GatewayError && error.httpStatus === 429)
      return { ok: false, status: 429, error: "The AI is busy right now. Try again in a minute." };
    if (error instanceof GatewayError && error.httpStatus === 402)
      return {
        ok: false,
        status: 402,
        error: "The app is out of AI credits. Ask the app owner to top up.",
      };
    return { ok: false, status: 502, error: "The AI couldn't answer right now. Try again." };
  }
  if (data.choices?.[0]?.finish_reason === "length")
    return { ok: false, status: 502, error: "The AI answer was cut short. Try again." };
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text)
    return { ok: false, status: 502, error: "The AI returned an empty answer. Try again." };
  return { ok: true, text };
}

/** Parses a JSON object out of a model reply, tolerating ```json fences or stray text. */
export function parseJsonObject(text: string): unknown {
  const fenced = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(fenced);
  } catch {
    const a = fenced.indexOf("{");
    const b = fenced.lastIndexOf("}");
    if (a >= 0 && b > a) {
      try {
        return JSON.parse(fenced.slice(a, b + 1));
      } catch {
        /* fall through */
      }
    }
    return null;
  }
}
