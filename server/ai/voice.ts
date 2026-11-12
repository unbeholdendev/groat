import { Hono } from "hono";
import { z } from "zod";
import type { Ctx } from "../context";
import { extract } from "./draft";
import { valid } from "../request";

const recording = z.object({
  audio: z.file("audio is required").min(1, "audio is required").max(25_000_000, "recording is too long"),
});

export function voiceRoutes(ctx: Pick<Ctx, "db" | "clock" | "ai">) {
  const app = new Hono();

  app.post("/api/voice", async (c) => {
    const off = await ctx.ai.unavailable("voice");
    if (off) return c.json({ error: off }, 403);
    const input = valid(recording, await c.req.parseBody().catch(() => undefined));
    if ("error" in input) return c.json(input, 400);
    const text = await ctx.ai.transcribe(input.data.audio);
    if (!text.trim()) return c.json({ error: "Nothing was heard. Try again closer to the mic." }, 422);
    return c.json(await extract(ctx, text));
  });

  app.onError((e, c) => c.json({ error: e.message }, 502));

  return app;
}
