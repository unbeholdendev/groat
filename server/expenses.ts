import { and, desc, eq, getTableColumns, gte, inArray, isNotNull, isNull, lte, or, type SQL, sql } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { z } from "zod";
import { parseAmount } from "../shared/amount";
import { expenseInput, isoDate } from "../shared/schema";
import type { Ctx } from "./app";
import type { Env } from "./auth";
import { type Db, settings, today, uncategorised, visible } from "./db";
import type { Valuer } from "./rates";
import { json, query, valid } from "./request";
import * as t from "./schema";

const e = t.expenses;
const { createdAt, updatedAt, deletedAt, createdBy, ...expenseColumns } = getTableColumns(e);

export const newest = [desc(e.date), desc(e.id)];

const tagList = z.array(z.string());

export const expenses = (db: Db, where?: SQL) =>
  db
    .select({
      ...expenseColumns,
      tags: sql`(SELECT json_group_array(name) FROM (SELECT name FROM expense_tags JOIN tags ON tags.id = tag_id
        WHERE expense_id = expenses.id ORDER BY name))`.mapWith((v: string) => tagList.parse(JSON.parse(v))),
      addedBy: sql<string | null>`(SELECT username FROM users WHERE users.id = expenses.created_by)`,
      attachmentId: sql<number | null>`(SELECT id FROM attachments WHERE expense_id = expenses.id)`,
    })
    .from(e)
    .where(where);

export const expenseQuery = z
  .object({
    from: isoDate.describe("YYYY-MM-DD"),
    to: isoDate.describe("YYYY-MM-DD"),
    category: z.coerce.number().int().describe("category id; includes its subcategories"),
    tag: z.string(),
    currency: z.string(),
    status: z.enum(["normal", "pending"]),
    q: z.string().describe("text the note contains"),
  })
  .partial();

export function expenseFilter(db: Db, q: z.infer<typeof expenseQuery>, base = visible) {
  const category = q.category;
  return and(
    base,
    q.from ? gte(e.date, q.from) : undefined,
    q.to ? lte(e.date, q.to) : undefined,
    category !== undefined
      ? inArray(e.categoryId, db.select({ id: t.categories.id }).from(t.categories).where(or(eq(t.categories.id, category), eq(t.categories.parentId, category))))
      : undefined,
    q.tag
      ? inArray(e.id, db.select({ id: t.expenseTags.expenseId }).from(t.expenseTags).innerJoin(t.tags, eq(t.tags.id, t.expenseTags.tagId)).where(eq(t.tags.name, q.tag)))
      : undefined,
    q.currency ? eq(e.currency, q.currency) : undefined,
    q.status ? eq(e.status, q.status) : undefined,
    q.q ? sql`instr(lower(${e.note}), lower(${q.q}))` : undefined,
  );
}

export function readExpense(raw: unknown, db: Db, today: string, fallback: string, currencies: string[], category: number, pending = false) {
  const parsed = valid(expenseInput, raw);
  if ("error" in parsed) return parsed;
  const { note, currency = fallback, date = today, categoryId = category, tags = [], unit } = parsed.data;
  if (currency !== fallback && !currencies.includes(currency)) return { error: "currency not enabled" };
  const amount = pending && parsed.data.amount === "0" ? 0 : parseAmount(parsed.data.amount, currency, unit);
  if (amount === null) return { error: "invalid amount" };
  // today is UTC; the user's local date can be a day ahead
  if (date > new Date(Date.parse(today) + 864e5).toISOString().slice(0, 10)) return { error: "date can’t be in the future" };
  if (!db.select().from(t.categories).where(eq(t.categories.id, categoryId)).get()) return { error: "invalid category" };
  return { note, amount, currency, date, categoryId, tags: [...new Set(tags)] };
}

type ExpenseFields = Exclude<ReturnType<typeof readExpense>, { error: string }>;

const attachment = z.object({ attachmentId: z.number().int().optional() });

export function addExpense(db: Db, now: string, { tags, ...fields }: ExpenseFields, createdBy: number, status = "normal", attachmentId?: number) {
  const { id } = db.insert(e).values({ ...fields, status, createdBy, createdAt: now, updatedAt: now }).returning({ id: e.id }).get();
  saveTags(db, id, tags);
  if (attachmentId) db.update(t.attachments).set({ expenseId: id }).where(and(eq(t.attachments.id, attachmentId), isNull(t.attachments.expenseId))).run();
  return expenses(db, eq(e.id, id)).get();
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
  db.delete(t.expenseTags).where(eq(t.expenseTags.expenseId, id)).run();
  for (const name of tags) {
    const { tagId } = db.insert(t.tags).values({ name }).onConflictDoUpdate({ target: t.tags.name, set: { name } }).returning({ tagId: t.tags.id }).get();
    db.insert(t.expenseTags).values({ expenseId: id, tagId }).run();
  }
}

export function expenseRoutes({ db, clock }: Ctx, value: Valuer) {
  const app = new Hono<Env>();

  app.get("/api/expenses", async (c) => {
    const q = query(c, expenseQuery);
    if ("error" in q) return c.json(q, 400);
    return c.json(await value(expenses(db, expenseFilter(db, q.data)).orderBy(...newest).all()));
  });

  app.get("/api/notes", (c) => c.json(suggestions(db, c.req.query("prefix") ?? "")));

  app.get("/api/bin", (c) => c.json(expenses(db, isNotNull(e.deletedAt)).orderBy(desc(e.deletedAt), desc(e.id)).all()));

  app.post("/api/expenses", async (c) => {
    const now = clock().toISOString();
    const { lastCurrency, currencies } = settings(db);
    const raw = await json(c);
    const body = readExpense(raw, db, today(clock), lastCurrency, currencies, uncategorised(db));
    if ("error" in body) return c.json(body, 400);
    const link = valid(attachment, raw);
    if ("error" in link) return c.json(link, 400);
    return c.json(addExpense(db, now, body, c.get("user").id, "normal", link.data.attachmentId), 201);
  });

  app.put("/api/expenses/:id", async (c) => {
    const now = clock().toISOString();
    const id = Number(c.req.param("id"));
    const old = db.select({ currency: e.currency, categoryId: e.categoryId }).from(e).where(and(eq(e.id, id), visible)).get();
    if (!old) return c.json({ error: "not found" }, 404);
    const body = readExpense(await json(c), db, today(clock), old.currency, settings(db).currencies, old.categoryId ?? uncategorised(db));
    if ("error" in body) return c.json(body, 400);
    const { tags, ...fields } = body;
    db.update(e).set({ ...fields, updatedAt: now }).where(eq(e.id, id)).run();
    saveTags(db, id, tags);
    return c.json(expenses(db, eq(e.id, id)).get());
  });

  const setExpense = (c: Context, set: Partial<typeof e.$inferInsert>, where: SQL) => {
    const id = Number(c.req.param("id"));
    return db.update(e).set(set).where(and(eq(e.id, id), where)).returning({ id: e.id }).get()
      ? c.json(expenses(db, eq(e.id, id)).get())
      : c.json({ error: "not found" }, 404);
  };

  app.delete("/api/expenses/:id", (c) => {
    if (c.req.query("purge") === undefined) return setExpense(c, { deletedAt: clock().toISOString() }, visible);
    const row = db.delete(e).where(eq(e.id, Number(c.req.param("id")))).returning({ id: e.id }).get();
    return row ? c.json(row) : c.json({ error: "not found" }, 404);
  });
  app.post("/api/expenses/:id/confirm", (c) => setExpense(c, { status: "normal" }, visible));
  app.post("/api/bin/:id/restore", (c) => setExpense(c, { deletedAt: null }, isNotNull(e.deletedAt)));

  app.delete("/api/bin", (c) => {
    db.delete(e).where(isNotNull(e.deletedAt)).run();
    return c.json({});
  });

  return app;
}
