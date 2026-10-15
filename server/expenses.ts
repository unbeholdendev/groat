import { and, desc, eq, getTableColumns, gte, inArray, isNotNull, lte, or, type SQL, sql } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { parseAmount } from "../shared/amount";
import type { Ctx } from "./app";
import { type Db, isDate, settings, today, uncategorised, visible } from "./db";
import type { Valuer } from "./rates";
import { json } from "./request";
import * as t from "./schema";

const e = t.expenses;
const { createdAt, updatedAt, deletedAt, ...expenseColumns } = getTableColumns(e);

export const newest = [desc(e.date), desc(e.id)];

export const expenses = (db: Db, where?: SQL) =>
  db
    .select({
      ...expenseColumns,
      tags: sql`(SELECT json_group_array(name) FROM (SELECT name FROM expense_tags JOIN tags ON tags.id = tag_id
        WHERE expense_id = expenses.id ORDER BY name))`.mapWith((v: string) => JSON.parse(v) as string[]),
    })
    .from(e)
    .where(where);

export function expenseFilter(db: Db, q: Record<string, string>, base = visible) {
  const category = Number(q.category);
  return and(
    base,
    q.from ? gte(e.date, q.from) : undefined,
    q.to ? lte(e.date, q.to) : undefined,
    q.category
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

export function readExpense(body: Record<string, any>, db: Db, today: string, fallback: string, currencies: string[], category: number) {
  const note = typeof body.note === "string" ? body.note.trim() : "";
  const currency = body.currency ?? fallback;
  if (currency !== fallback && !currencies.includes(currency)) return { error: "currency not enabled" };
  const amount = typeof body.amount === "string" ? parseAmount(body.amount, currency, body.unit) : null;
  const date = body.date ?? today;
  const categoryId: number = body.categoryId ?? category;
  const tags = body.tags ?? [];
  if (!note) return { error: "note is required" };
  if (amount === null) return { error: "invalid amount" };
  if (!isDate(date)) return { error: "invalid date" };
  // today is UTC; the user's local date can be a day ahead
  if (date > new Date(Date.parse(today) + 864e5).toISOString().slice(0, 10)) return { error: "date can’t be in the future" };
  if (!db.select().from(t.categories).where(eq(t.categories.id, categoryId)).get()) return { error: "invalid category" };
  if (!Array.isArray(tags) || !tags.every((t) => typeof t === "string" && t.trim())) return { error: "invalid tags" };
  return { note, amount, currency, date, categoryId, tags: [...new Set(tags.map((t: string) => t.trim()))] };
}

export function saveTags(db: Db, id: number, tags: string[]) {
  db.delete(t.expenseTags).where(eq(t.expenseTags.expenseId, id)).run();
  for (const name of tags) {
    const { tagId } = db.insert(t.tags).values({ name }).onConflictDoUpdate({ target: t.tags.name, set: { name } }).returning({ tagId: t.tags.id }).get();
    db.insert(t.expenseTags).values({ expenseId: id, tagId }).run();
  }
}

export function expenseRoutes({ db, clock }: Ctx, value: Valuer) {
  const app = new Hono();

  app.get("/api/expenses", async (c) => c.json(await value(expenses(db, expenseFilter(db, c.req.query())).orderBy(...newest).all())));

  app.get("/api/notes", (c) => {
    const prefix = c.req.query("prefix") ?? "";
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
    return c.json(
      db.select({ note, categoryId, currency, amount }).from(ranked).where(eq(ranked.n, 1)).orderBy(desc(ranked.date), desc(ranked.id)).limit(10).all(),
    );
  });

  app.get("/api/bin", (c) => c.json(expenses(db, isNotNull(e.deletedAt)).orderBy(desc(e.deletedAt), desc(e.id)).all()));

  app.post("/api/expenses", async (c) => {
    const now = clock().toISOString();
    const { lastCurrency, currencies } = settings(db);
    const body = readExpense(await json(c), db, today(clock), lastCurrency, currencies, uncategorised(db));
    if ("error" in body) return c.json(body, 400);
    const { tags, ...fields } = body;
    const { id } = db.insert(e).values({ ...fields, createdAt: now, updatedAt: now }).returning({ id: e.id }).get();
    saveTags(db, id, tags);
    return c.json(expenses(db, eq(e.id, id)).get(), 201);
  });

  app.put("/api/expenses/:id", async (c) => {
    const now = clock().toISOString();
    const id = Number(c.req.param("id"));
    const old = db.select({ currency: e.currency, categoryId: e.categoryId }).from(e).where(and(eq(e.id, id), visible)).get();
    if (!old) return c.json({ error: "not found" }, 404);
    const body = readExpense(await json(c), db, today(clock), old.currency, settings(db).currencies, old.categoryId!);
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
