import { Hono } from "hono";
import type { Ctx } from "../context";
import { body } from "../request";
import { extract, textInput } from "./draft";

export function draftRoutes(ctx: Pick<Ctx, "db" | "clock" | "ai">) {
  const app = new Hono();

  app.post("/api/drafts", async (c) => {
    const off = await ctx.ai.unavailable("chat");
    if (off) return c.json({ error: off }, 403);
    const parsed = await body(c, textInput);
    if ("error" in parsed) return c.json(parsed, 400);
    return c.json(await extract(ctx, parsed.data.text));
  });

  return app;
}
