import { and, desc, eq, isNotNull, type SQL } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { z } from "zod";
import type { Env } from "../auth/access";
import type { Ctx } from "../context";
import { json, query, valid } from "../request";
import * as schema from "../schema";
import {
  addTransaction,
  newest,
  saveTags,
  savedTransaction,
  suggestions,
  transactionFilter,
  transactionQuery,
  transactions,
  visible,
} from "./queries";
import { readTransaction } from "./read-transaction";

const attachment = z.object({ attachmentId: z.number().int().optional(), requestId: z.uuid().optional() });

export function transactionRoutes(ctx: Pick<Ctx, "db" | "clock" | "value">) {
  const { db, clock, value } = ctx;
  const valued = async (id: number) => (await value([savedTransaction(db, id)]))[0];
  const app = new Hono<Env>();

  app.get("/api/transactions", async (c) => {
    const q = query(c, transactionQuery);
    if ("error" in q) return c.json(q, 400);
    return c.json(
      await value(
        transactions(db, transactionFilter(db, q.data))
          .orderBy(...newest)
          .all(),
      ),
    );
  });

  app.get("/api/notes", (c) => c.json(suggestions(db, c.req.query("prefix") ?? "")));

  app.get("/api/bin", (c) =>
    c.json(
      transactions(db, isNotNull(schema.transactions.deletedAt))
        .orderBy(desc(schema.transactions.deletedAt), desc(schema.transactions.id))
        .all(),
    ),
  );

  app.post("/api/transactions", async (c) => {
    const now = clock().toISOString();
    const raw = await json(c);
    const body = readTransaction(ctx, raw, { intent: "add" });
    if ("error" in body) return c.json(body, 400);
    const link = valid(attachment, raw);
    if ("error" in link) return c.json(link, 400);
    const key = link.data.requestId ? `${c.get("user").id}:${link.data.requestId}` : null;
    const id = db.transaction(() => {
      const existing =
        key &&
        db
          .select({ id: schema.transactions.id })
          .from(schema.transactions)
          .where(eq(schema.transactions.clientRequestId, key))
          .get();
      if (existing) return existing.id;
      const row = addTransaction(db, now, body, c.get("user").id, "normal", link.data.attachmentId);
      if (key)
        db.update(schema.transactions).set({ clientRequestId: key }).where(eq(schema.transactions.id, row.id)).run();
      return row.id;
    });
    return c.json(await valued(id), 201);
  });

  app.put("/api/transactions/:id", async (c) => {
    const now = clock().toISOString();
    const id = Number(c.req.param("id"));
    const old = db
      .select({ currency: schema.transactions.currency, categoryId: schema.transactions.categoryId })
      .from(schema.transactions)
      .where(and(eq(schema.transactions.id, id), visible))
      .get();
    if (!old) return c.json({ error: "Not found" }, 404);
    const body = readTransaction(ctx, await json(c), { intent: "edit", old });
    if ("error" in body) return c.json(body, 400);
    const { tags, ...fields } = body;
    db.update(schema.transactions)
      .set({ ...fields, updatedAt: now })
      .where(eq(schema.transactions.id, id))
      .run();
    saveTags(db, id, tags);
    return c.json(await valued(id));
  });

  const setTransaction = async (c: Context, set: Partial<typeof schema.transactions.$inferInsert>, where: SQL) => {
    const id = Number(c.req.param("id"));
    return db
      .update(schema.transactions)
      .set(set)
      .where(and(eq(schema.transactions.id, id), where))
      .returning({ id: schema.transactions.id })
      .get()
      ? c.json(await valued(id))
      : c.json({ error: "Not found" }, 404);
  };

  app.delete("/api/transactions/:id", (c) => {
    if (c.req.query("purge") === undefined) return setTransaction(c, { deletedAt: clock().toISOString() }, visible);
    const row = db
      .delete(schema.transactions)
      .where(eq(schema.transactions.id, Number(c.req.param("id"))))
      .returning({ id: schema.transactions.id })
      .get();
    return row ? c.json(row) : c.json({ error: "Not found" }, 404);
  });
  app.post("/api/transactions/:id/confirm", (c) => setTransaction(c, { status: "normal" }, visible));
  app.post("/api/bin/:id/restore", (c) =>
    setTransaction(c, { deletedAt: null }, isNotNull(schema.transactions.deletedAt)),
  );

  app.delete("/api/bin", (c) => {
    db.delete(schema.transactions).where(isNotNull(schema.transactions.deletedAt)).run();
    return c.json({});
  });

  return app;
}
