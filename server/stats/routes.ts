import { Hono } from "hono";
import type { Ctx } from "../context";
import { query } from "../request";
import { range, stats } from "./period";

export function statsRoutes(ctx: Pick<Ctx, "db" | "value">) {
  const app = new Hono();

  app.get("/api/stats", async (c) => {
    const q = query(c, range);
    if ("error" in q) return c.json({ error: "Invalid date range" }, 400);
    const { from, to, group } = q.data;
    return c.json(await stats(ctx, from, to, group));
  });

  return app;
}
