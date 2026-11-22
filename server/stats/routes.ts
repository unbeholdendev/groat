import { type Context, Hono } from "hono";
import type { Ctx } from "../context";
import { query } from "../request";
import { period, range, sats } from "./period";

export function statsRoutes(ctx: Pick<Ctx, "db" | "value" | "clock">) {
  const app = new Hono();
  const answer = async (c: Context, of: typeof period | typeof sats) => {
    const q = query(c, range);
    if ("error" in q) return c.json({ error: "Invalid date range" }, 400);
    return c.json(await of(ctx, q.data));
  };

  app.get("/api/stats", (c) => answer(c, period));
  app.get("/api/stats/sats", (c) => answer(c, sats));

  return app;
}
