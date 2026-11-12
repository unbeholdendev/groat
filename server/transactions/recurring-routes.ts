import { and, eq, isNull } from "drizzle-orm";
import { type Context, Hono } from "hono";
import type { Ctx } from "../context";
import { json } from "../request";
import * as schema from "../schema";
import { generateRecurring, readTemplate, templates } from "./recurring";

export function recurringRoutes(ctx: Pick<Ctx, "db" | "clock">) {
  const { db, clock } = ctx;
  const app = new Hono();

  app.get("/api/recurring", (c) => c.json(templates(db).orderBy(schema.recurring.id).all()));

  app.post("/api/recurring", async (c) => {
    const template = readTemplate(ctx, await json(c), { intent: "add" });
    if ("error" in template) return c.json(template, 400);
    const { id } = db.insert(schema.recurring).values(template).returning({ id: schema.recurring.id }).get();
    generateRecurring(ctx);
    return c.json(templates(db, eq(schema.recurring.id, id)).get(), 201);
  });

  app.put("/api/recurring/:id", async (c) => {
    const id = Number(c.req.param("id"));
    const old = templates(db, eq(schema.recurring.id, id)).get();
    if (!old) return c.json({ error: "Not found" }, 404);
    const template = readTemplate(ctx, await json(c), { intent: "edit", old });
    if ("error" in template) return c.json(template, 400);
    db.update(schema.recurring).set(template).where(eq(schema.recurring.id, id)).run();
    generateRecurring(ctx);
    return c.json(templates(db, eq(schema.recurring.id, id)).get());
  });

  const setTemplate = (c: Context, set: Partial<typeof schema.recurring.$inferInsert>) => {
    const id = Number(c.req.param("id"));
    return db
      .update(schema.recurring)
      .set(set)
      .where(and(eq(schema.recurring.id, id), isNull(schema.recurring.deletedAt)))
      .returning({ id: schema.recurring.id })
      .get()
      ? c.json(templates(db, eq(schema.recurring.id, id)).get() ?? {})
      : c.json({ error: "Not found" }, 404);
  };

  app.post("/api/recurring/:id/pause", (c) => setTemplate(c, { paused: true }));
  app.post("/api/recurring/:id/resume", (c) => {
    generateRecurring(ctx, c.req.param("id"));
    return setTemplate(c, { paused: false });
  });
  app.delete("/api/recurring/:id", (c) => setTemplate(c, { deletedAt: clock().toISOString() }));

  return app;
}
