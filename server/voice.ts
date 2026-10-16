import { Hono } from "hono";
import { z } from "zod";
import { aiEnabled } from "./ai";
import type { Ctx, Deps } from "./app";
import { extract } from "./draft";
import { valid } from "./request";

const recording = z.object({ audio: z.file("audio is required").min(1, "audio is required").max(25_000_000, "recording is too long") });
const transcript = z.object({ text: z.string() });

function stt(config: Deps["config"]) {
  const base = config.sttBaseUrl || config.aiBaseUrl;
  const key = config.sttKey || config.aiApiKey;
  const model = config.sttModel;
  return aiEnabled(config) && base && key && model ? { base, key, model } : null;
}

export const voiceEnabled = (config: Deps["config"]) => !!stt(config);

export function voiceRoutes(ctx: Ctx) {
  const app = new Hono();

  app.post("/api/voice", async (c) => {
    const provider = stt(ctx.config);
    if (!provider) return c.json({ error: "voice is not configured" }, 403);
    const { base, key, model } = provider;
    const input = valid(recording, await c.req.parseBody().catch(() => undefined));
    if ("error" in input) return c.json(input, 400);
    const form = new FormData();
    form.append("file", input.data.audio);
    form.append("model", model);
    const res = await ctx.fetch(`${base}/audio/transcriptions`, { method: "POST", headers: { authorization: `Bearer ${key}` }, body: form });
    if (!res.ok) throw new Error(`speech-to-text provider returned ${res.status}`);
    const heard = transcript.safeParse(await res.json().catch(() => undefined));
    if (!heard.success) throw new Error("speech-to-text provider sent an unexpected reply");
    if (!heard.data.text.trim()) return c.json({ error: "Nothing was heard. Try again closer to the mic." }, 422);
    return c.json(await extract(ctx, heard.data.text));
  });

  app.onError((e, c) => c.json({ error: e.message }, 502));

  return app;
}
