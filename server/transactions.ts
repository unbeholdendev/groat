import { and, desc, eq, getTableColumns, gte, inArray, isNotNull, isNull, lte, or, type SQL, sql } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { z } from "zod";
import { isoDate, kind } from "../shared/schema";
import type { Ctx } from "./app";
import type { Env } from "./auth";
import { type Db, kindOf, visible } from "./db";
import { readTransaction, type TransactionFields } from "./read-transaction";
import type { Valuer } from "./rates";
import { json, query, valid } from "./request";
import * as t from "./schema";

const e = t.transactions;
const { createdAt, updatedAt, deletedAt, createdBy, clientRequestId, ...transactionColumns } = getTableColumns(e);

export const newest = [desc(e.date), desc(e.id)];

const tagList = z.array(z.string());

export const transactions = (db: Db, where?: SQL) =>
  db
    .select({
      ...transactionColumns,
      tags: sql`(SELECT json_group_array(name) FROM (SELECT name FROM transaction_tags JOIN tags ON tags.id = tag_id
        WHERE transaction_id = transactions.id ORDER BY name))`.mapWith((v: string) => tagList.parse(JSON.parse(v))),
      addedBy: sql<string | null>`(SELECT username FROM users WHERE users.id = transactions.created_by)`,
      attachmentId: sql<number | null>`(SELECT id FROM attachments WHERE transaction_id = transactions.id)`,
    })
    .from(e)
    .where(where);

export const transactionQuery = z
  .object({
    from: isoDate.describe("YYYY-MM-DD"),
    to: isoDate.describe("YYYY-MM-DD"),
    category: z.coerce.number().int().describe("category id; includes its subcategories"),
    tag: z.string(),
    currency: z.string(),
    status: z.enum(["normal", "pending"]),
    kind: kind.describe("expense or income, from the category"),
    q: z.string().describe("text the note contains"),
  })
  .partial();

export function transactionFilter(db: Db, q: z.infer<typeof transactionQuery>, base = visible) {
  const category = q.category;
  return and(
    base,
    q.from ? gte(e.date, q.from) : undefined,
    q.to ? lte(e.date, q.to) : undefined,
    category !== undefined
      ? inArray(e.categoryId, db.select({ id: t.categories.id }).from(t.categories).where(or(eq(t.categories.id, category), eq(t.categories.parentId, category))))
      : undefined,
    q.tag
      ? inArray(e.id, db.select({ id: t.transactionTags.transactionId }).from(t.transactionTags).innerJoin(t.tags, eq(t.tags.id, t.transactionTags.tagId)).where(eq(t.tags.name, q.tag)))
      : undefined,
    q.currency ? eq(e.currency, q.currency) : undefined,
    q.status ? eq(e.status, q.status) : undefined,
    q.kind ? eq(kindOf, q.kind) : undefined,
    q.q ? sql`instr(lower(${e.note}), lower(${q.q}))` : undefined,
  );
}

const attachment = z.object({ attachmentId: z.number().int().optional(), requestId: z.uuid().optional() });

export function addTransaction(db: Db, now: string, { tags, ...fields }: TransactionFields, createdBy: number, status = "normal", attachmentId?: number) {
  const { id } = db.insert(e).values({ ...fields, status, createdBy, createdAt: now, updatedAt: now }).returning({ id: e.id }).get();
  saveTags(db, id, tags);
  if (attachmentId) db.update(t.attachments).set({ transactionId: id }).where(and(eq(t.attachments.id, attachmentId), isNull(t.attachments.transactionId))).run();
  return transactions(db, eq(e.id, id)).get();
}

export function suggestions(db: Db, prefix: string) {
  const ranked = db
    .select({
      note: e.note,
      categoryId: e.categoryId,
      currency: e.currency,
      amount: e.amount,
      date: e.date,
      id: e.id,
      n: sql<number>`row_number() OVER (PARTITION BY ${e.note} ORDER BY ${e.date} DESC, ${e.id} DESC)`.as("n"),
    })
    .from(e)
    .where(and(visible, sql`lower(substr(${e.note}, 1, length(${prefix}))) = lower(${prefix})`))
    .as("ranked");
  const { note, categoryId, currency, amount } = ranked;
  return db.select({ note, categoryId, currency, amount }).from(ranked).where(eq(ranked.n, 1)).orderBy(desc(ranked.date), desc(ranked.id)).limit(10).all();
}

export function saveTags(db: Db, id: number, tags: string[]) {
  db.delete(t.transactionTags).where(eq(t.transactionTags.transactionId, id)).run();
  for (const name of tags) {
    const { tagId } = db.insert(t.tags).values({ name }).onConflictDoUpdate({ target: t.tags.name, set: { name } }).returning({ tagId: t.tags.id }).get();
    db.insert(t.transactionTags).values({ transactionId: id, tagId }).run();
  }
}

export function transactionRoutes(ctx: Ctx, value: Valuer) {
  const { db, clock } = ctx;
  const valued = async (id: number) => (await value([transactions(db, eq(e.id, id)).get()!]))[0];
  const app = new Hono<Env>();

  app.get("/api/transactions", async (c) => {
    const q = query(c, transactionQuery);
    if ("error" in q) return c.json(q, 400);
    return c.json(await value(transactions(db, transactionFilter(db, q.data)).orderBy(...newest).all()));
  });

  app.get("/api/notes", (c) => c.json(suggestions(db, c.req.query("prefix") ?? "")));

  app.get("/api/bin", (c) => c.json(transactions(db, isNotNull(e.deletedAt)).orderBy(desc(e.deletedAt), desc(e.id)).all()));

  app.post("/api/transactions", async (c) => {
    const now = clock().toISOString();
    const raw = await json(c);
    const body = readTransaction(ctx, raw, { intent: "add" });
    if ("error" in body) return c.json(body, 400);
    const link = valid(attachment, raw);
    if ("error" in link) return c.json(link, 400);
    const key = link.data.requestId ? `${c.get("user").id}:${link.data.requestId}` : null;
    const id = db.transaction(() => {
      const existing = key && db.select({ id: e.id }).from(e).where(eq(e.clientRequestId, key)).get();
      if (existing) return existing.id;
      const row = addTransaction(db, now, body, c.get("user").id, "normal", link.data.attachmentId)!;
      if (key) db.update(e).set({ clientRequestId: key }).where(eq(e.id, row.id)).run();
      return row.id;
    });
    return c.json(await valued(id), 201);
  });

  app.put("/api/transactions/:id", async (c) => {
    const now = clock().toISOString();
    const id = Number(c.req.param("id"));
    const old = db.select({ currency: e.currency, categoryId: e.categoryId }).from(e).where(and(eq(e.id, id), visible)).get();
    if (!old) return c.json({ error: "Not found" }, 404);
    const body = readTransaction(ctx, await json(c), { intent: "edit", old });
    if ("error" in body) return c.json(body, 400);
    const { tags, ...fields } = body;
    db.update(e).set({ ...fields, updatedAt: now }).where(eq(e.id, id)).run();
    saveTags(db, id, tags);
    return c.json(await valued(id));
  });

  const setTransaction = async (c: Context, set: Partial<typeof e.$inferInsert>, where: SQL) => {
    const id = Number(c.req.param("id"));
    return db.update(e).set(set).where(and(eq(e.id, id), where)).returning({ id: e.id }).get()
      ? c.json(await valued(id))
      : c.json({ error: "Not found" }, 404);
  };

  app.delete("/api/transactions/:id", (c) => {
    if (c.req.query("purge") === undefined) return setTransaction(c, { deletedAt: clock().toISOString() }, visible);
    const row = db.delete(e).where(eq(e.id, Number(c.req.param("id")))).returning({ id: e.id }).get();
    return row ? c.json(row) : c.json({ error: "Not found" }, 404);
  });
  app.post("/api/transactions/:id/confirm", (c) => setTransaction(c, { status: "normal" }, visible));
  app.post("/api/bin/:id/restore", (c) => setTransaction(c, { deletedAt: null }, isNotNull(e.deletedAt)));

  app.delete("/api/bin", (c) => {
    db.delete(e).where(isNotNull(e.deletedAt)).run();
    return c.json({});
  });

  return app;
}
