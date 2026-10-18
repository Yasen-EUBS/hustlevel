import { beforeEach, expect, it, vi } from "vitest";

const generate = vi.hoisted(() => vi.fn());
vi.mock("@lovable.dev/ai-gateway", () => ({
  generateChatCompletion: generate,
  GatewayError: class extends Error {},
}));
import { complete } from "../lib/server/ai";

beforeEach(() => generate.mockReset());

it("keeps the 500-token coach budget and minimizes hidden reasoning", async () => {
  generate.mockResolvedValue({ choices: [{ finish_reason: "stop", message: { content: "Set 1: 85 kg." } }] });
  expect(await complete({ system: "Coach", user: "10×80", maxTokens: 500 })).toEqual({ ok: true, text: "Set 1: 85 kg." });
  expect(generate.mock.calls[0]?.[0]).toMatchObject({ model: "google/gemini-3.8-flash", max_completion_tokens: 500, reasoning_effort: "minimal" });
});

it("does not return a truncated response as a successful summary", async () => {
  generate.mockResolvedValue({ choices: [{ finish_reason: "length", message: { content: "**Wins**: New" } }] });
  expect(await complete({ system: "Coach", user: "10×80", maxTokens: 500 })).toMatchObject({ ok: false, status: 502 });
});