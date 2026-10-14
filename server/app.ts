import type { Database } from "bun:sqlite";
import { and, desc, eq, getTableColumns, gte, inArray, isNotNull, isNull, lte, ne, or, type SQL, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { type Context, Hono } from "hono";
import { formatAmount, parseAmount } from "../shared/amount";
import { countable, type Db, isDate, settings as stored, today, uncategorised, visible } from "./db";
import { aiEnabled, chats } from "./ai";
import { valuer } from "./rates";
import * as t from "./schema";
import { groups, stats } from "./stats";

export type Deps = {
  db: Database;
  clock: () => Date;
  fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  config: { aiBaseUrl?: string; aiApiKey?: string; aiModel?: string };
};

export type Ctx = Omit<Deps, "db"> & { db: Db };

const defaultCategories: [string, string, string, [string, string][]?][] = [
  ["Food", "🍽️", "#f98942", [["Groceries", "🛒"], ["Eating out", "🍜"]]],
  ["Transport", "🚗", "#26c0cf", [["Fuel", "⛽"], ["Public transport", "🚆"], ["Taxi", "🚕"]]],
  ["Home", "🏠", "#3fbe90", [["Rent/Mortgage", "🔑"], ["Utilities", "💡"], ["Maintenance", "🧰"]]],
  ["Subscriptions", "📺", "#bf73df"],
  ["Health", "💊", "#f16f7e"],
  ["Shopping", "🛍️", "#e977bb"],
  ["Entertainment", "🎬", "#f4bf3f"],
  ["Travel", "✈️", "#99d352"],
  ["Gifts", "🎁", "#e977bb"],
];

const knownCurrencies = new Set([...Intl.supportedValuesOf("currency"), "BTC"]);

function shortlist(base: unknown, list: unknown) {
  if (!Array.isArray(list) || !list.every((c) => knownCurrencies.has(c)) || !knownCurrencies.has(base as string))
    return null;
  return [...new Set([base as string, ...list])];
}

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

export const json = (c: Context) => c.req.json().catch(() => ({}));

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

export function createApp(deps: Deps) {
  const { clock, config } = deps;
  deps.db.run("PRAGMA foreign_keys = ON");
  const db = drizzle(deps.db, { casing: "snake_case" });
  migrate(db, { migrationsFolder: `${import.meta.dir}/drizzle` });
  const ctx = { ...deps, db };
  const app = new Hono();
  const value = valuer(ctx);
  const cat = t.categories;
  const r = t.recurring;

  for (const file of ["sw.js", "manifest.webmanifest"])
    app.get(`/${file}`, () => new Response(Bun.file(`${import.meta.dir}/${file}`)));

  app.use("/api/*", async (c, next) => {
    await next();
    c.header("cache-control", "no-store");
  });

  const settings = () => ({ ...stored(db), ai: aiEnabled(config) });

  const saveTags = (id: number, tags: string[]) => {
    db.delete(t.expenseTags).where(eq(t.expenseTags.expenseId, id)).run();
    for (const name of tags) {
      const { tagId } = db.insert(t.tags).values({ name }).onConflictDoUpdate({ target: t.tags.name, set: { name } }).returning({ tagId: t.tags.id }).get();
      db.insert(t.expenseTags).values({ expenseId: id, tagId }).run();
    }
  };

  app.get("/api/settings", (c) => c.json(settings()));

  app.put("/api/settings", async (c) => {
    const { baseCurrency, currencies, theme } = { ...settings(), ...(await json(c)) };
    const list = shortlist(baseCurrency, currencies);
    if (!list) return c.json({ error: "invalid currencies" }, 400);
    if (!["system", "light", "dark"].includes(theme)) return c.json({ error: "invalid theme" }, 400);
    db.update(t.settings).set({ baseCurrency, currencies: list, theme }).run();
    return c.json(settings());
  });

  app.post("/api/onboarding", async (c) => {
    if (settings().onboarded) return c.json({ error: "already onboarded" }, 409);
    const body = await json(c);
    const currencies = shortlist(body.baseCurrency, body.currencies);
    if (!currencies) return c.json({ error: "invalid currencies" }, 400);
    db.transaction(() => {
      db.update(t.settings).set({ baseCurrency: body.baseCurrency, currencies, onboarded: true }).run();
      defaultCategories.forEach(([name, icon, color, children = []], i) => {
        const { id } = db.insert(cat).values({ name, icon, color, sort: i }).returning({ id: cat.id }).get();
        children.forEach(([child, childIcon], j) => db.insert(cat).values({ name: child, icon: childIcon, color, parentId: id, sort: j }).run());
      });
    });
    return c.json(settings());
  });

  const categories = (where?: SQL) =>
    db.select({ id: cat.id, name: cat.name, icon: cat.icon, color: cat.color, parentId: cat.parentId, builtin: cat.builtin }).from(cat).where(where);

  const filled = (...values: unknown[]) => values.every((v) => typeof v === "string" && v.trim());

  app.get("/api/categories", (c) => c.json(categories().orderBy(isNotNull(cat.parentId), cat.sort).all()));

  app.post("/api/categories", async (c) => {
    const { name, icon, color, parentId = null } = await json(c);
    if (!filled(name, icon, color)) return c.json({ error: "name, icon and colour are required" }, 400);
    if (parentId !== null && !db.select().from(cat).where(and(eq(cat.id, parentId), isNull(cat.parentId))).get())
      return c.json({ error: "invalid parent" }, 400);
    const sort = sql`(SELECT coalesce(max(sort), -1) + 1 FROM categories WHERE parent_id IS ${parentId})`;
    const { id } = db.insert(cat).values({ name: name.trim(), icon, color, parentId, sort }).returning({ id: cat.id }).get();
    return c.json(categories(eq(cat.id, id)).get(), 201);
  });

  app.put("/api/categories/order", async (c) => {
    const ids = await json(c);
    if (!Array.isArray(ids) || !ids.every(Number.isInteger)) return c.json({ error: "expected a list of ids" }, 400);
    db.transaction(() => ids.forEach((id, i) => db.update(cat).set({ sort: i }).where(eq(cat.id, id)).run()));
    return c.json({});
  });

  app.put("/api/categories/:id", async (c) => {
    const id = Number(c.req.param("id"));
    const old = categories(eq(cat.id, id)).get();
    if (!old) return c.json({ error: "not found" }, 404);
    const { name, icon, color } = { ...old, ...(await json(c)) };
    if (!filled(name, icon, color)) return c.json({ error: "name, icon and colour are required" }, 400);
    db.update(cat).set({ name: name.trim(), icon, color }).where(eq(cat.id, id)).run();
    return c.json(categories(eq(cat.id, id)).get());
  });

  app.delete("/api/categories/:id", (c) => {
    const id = Number(c.req.param("id"));
    const old = categories(eq(cat.id, id)).get();
    if (!old) return c.json({ error: "not found" }, 404);
    if (old.builtin) return c.json({ error: "Uncategorised cannot be deleted" }, 400);
    const moveTo = Number(c.req.query("moveTo") ?? uncategorised(db));
    if (!db.select().from(cat).where(and(eq(cat.id, moveTo), ne(cat.id, id), sql`${cat.parentId} IS NOT ${id}`)).get())
      return c.json({ error: "invalid moveTo" }, 400);
    const family = or(eq(cat.id, id), eq(cat.parentId, id));
    const members = db.select({ id: cat.id }).from(cat).where(family);
    db.transaction(() => {
      db.update(e).set({ categoryId: moveTo }).where(inArray(e.categoryId, members)).run();
      db.update(r).set({ categoryId: moveTo }).where(inArray(r.categoryId, members)).run();
      db.delete(cat).where(family).run();
    });
    return c.json({});
  });

  app.get("/api/tags", (c) => c.json(db.select().from(t.tags).orderBy(t.tags.name).all()));

  app.put("/api/tags/:id", async (c) => {
    const { name } = await json(c);
    const id = Number(c.req.param("id"));
    if (!filled(name)) return c.json({ error: "name is required" }, 400);
    if (db.select().from(t.tags).where(and(eq(t.tags.name, name.trim()), ne(t.tags.id, id))).get())
      return c.json({ error: "tag already exists" }, 409);
    const old = retag(id, name.trim());
    return old ? c.json({ id: old.id, name: name.trim() }) : c.json({ error: "not found" }, 404);
  });

  app.delete("/api/tags/:id", (c) => (retag(Number(c.req.param("id")), null) ? c.json({}) : c.json({ error: "not found" }, 404)));

  const retag = (id: number, name: string | null) =>
    db.transaction(() => {
      const old = db.select().from(t.tags).where(eq(t.tags.id, id)).get();
      if (!old) return null;
      db.update(r)
        .set({
          tags: sql`(SELECT json_group_array(CASE WHEN value = ${old.name} THEN ${name} ELSE value END)
          FROM json_each(recurring.tags) WHERE ${name} IS NOT NULL OR value != ${old.name})`,
        })
        .run();
      if (name === null) db.delete(t.tags).where(eq(t.tags.id, id)).run();
      else db.update(t.tags).set({ name }).where(eq(t.tags.id, id)).run();
      return old;
    });

  app.get("/api/expenses", async (c) => c.json(await value(expenses(db, expenseFilter(db, c.req.query())).orderBy(...newest).all())));

  app.get("/api/export", async (c) => {
    const rows = expenses(db, expenseFilter(db, c.req.query(), countable)).orderBy(...newest).all();
    const { baseCurrency } = settings();
    const cats = new Map(categories().all().map((r) => [r.id, r]));
    const cell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);
    const lines = (await value(rows)).map((e) => {
      const cat = cats.get(e.categoryId!)!;
      const [category, sub] = cat.parentId ? [cats.get(cat.parentId)!.name, cat.name] : [cat.name, ""];
      const base = e.baseAmount === null ? "" : formatAmount(e.baseAmount, baseCurrency);
      return [e.date, e.note, formatAmount(e.amount, e.currency), e.currency, base, baseCurrency, category, sub, e.tags.join(", ")];
    });
    const header = ["date", "note", "amount", "currency", "base amount", "base currency", "category", "subcategory", "tags"];
    return c.body([header, ...lines].map((l) => `${l.map(cell).join(",")}\r\n`).join(""), 200, { "content-type": "text/csv; charset=utf-8" });
  });

  app.get("/api/stats", async (c) => {
    const { from = "", to = "", group = "day" } = c.req.query();
    if (!isDate(from) || !isDate(to) || from > to || !groups.includes(group as never))
      return c.json({ error: "invalid range" }, 400);
    return c.json(await stats(db, value, from, to, group as (typeof groups)[number]));
  });

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

  app.put("/api/rates", async (c) => {
    const { date, currency, rate } = await json(c);
    if (!isDate(date) || !knownCurrencies.has(currency) || typeof rate !== "string" || !/^\d+(\.\d+)?$/.test(rate) || !Number(rate))
      return c.json({ error: "invalid rate" }, 400);
    const row = { rate: Number(rate), source: "manual" };
    db.insert(t.rates).values({ date, currency, ...row }).onConflictDoUpdate({ target: [t.rates.date, t.rates.currency], set: row }).run();
    return c.json({ date, currency, rate: Number(rate) });
  });

  app.get("/api/bin", (c) => c.json(expenses(db, isNotNull(e.deletedAt)).orderBy(desc(e.deletedAt), desc(e.id)).all()));

  app.post("/api/expenses", async (c) => {
    const now = clock().toISOString();
    const { lastCurrency, currencies } = settings();
    const body = readExpense(await json(c), db, today(clock), lastCurrency, currencies, uncategorised(db));
    if ("error" in body) return c.json(body, 400);
    const { tags, ...fields } = body;
    const { id } = db.insert(e).values({ ...fields, createdAt: now, updatedAt: now }).returning({ id: e.id }).get();
    saveTags(id, tags);
    return c.json(expenses(db, eq(e.id, id)).get(), 201);
  });

  app.put("/api/expenses/:id", async (c) => {
    const now = clock().toISOString();
    const id = Number(c.req.param("id"));
    const old = db.select({ currency: e.currency, categoryId: e.categoryId }).from(e).where(and(eq(e.id, id), visible)).get();
    if (!old) return c.json({ error: "not found" }, 404);
    const body = readExpense(await json(c), db, today(clock), old.currency, settings().currencies, old.categoryId!);
    if ("error" in body) return c.json(body, 400);
    const { tags, ...fields } = body;
    db.update(e).set({ ...fields, updatedAt: now }).where(eq(e.id, id)).run();
    saveTags(id, tags);
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

  const { deletedAt: _, ...templateColumns } = getTableColumns(r);
  const templates = (where?: SQL) => db.select(templateColumns).from(r).where(and(isNull(r.deletedAt), where));

  const readTemplate = (body: Record<string, any>, fallback: string, category: number) => {
    const e = readExpense({ ...body, date: today(clock) }, db, today(clock), fallback, settings().currencies, category);
    if ("error" in e) return { error: e.error };
    const { period, every, startDate = today(clock), endDate = null, needsConfirmation = false } = body;
    if (!["day", "week", "month", "year"].includes(period) || !Number.isInteger(every) || every < 1) return { error: "invalid schedule" };
    if (!isDate(startDate)) return { error: "invalid date" };
    if (endDate !== null && !isDate(endDate)) return { error: "invalid end date" };
    const { note, amount, currency, categoryId, tags } = e;
    return { note, amount, currency, categoryId, tags, period, every, startDate, endDate, needsConfirmation: !!needsConfirmation };
  };

  function generate(skip?: string) {
    const now = clock().toISOString();
    const rows = db
      .select()
      .from(r)
      .where(skip ? eq(r.id, Number(skip)) : and(isNull(r.deletedAt), eq(r.paused, false)))
      .all();
    db.transaction(() => {
      for (const tpl of rows) {
        let last = tpl.lastDate;
        for (let d; (d = last && last >= tpl.startDate ? next(last, tpl) : tpl.startDate) <= today(clock) && (!tpl.endDate || d <= tpl.endDate); last = d) {
          if (skip) continue;
          const status = tpl.needsConfirmation ? "pending" : "normal";
          const { note, amount, currency, categoryId } = tpl;
          const values = { note, amount, currency, date: d, categoryId, recurringId: tpl.id, status, createdAt: now, updatedAt: now };
          const { id } = db.insert(e).values(values).returning({ id: e.id }).get();
          saveTags(id, tpl.tags);
        }
        db.update(r).set({ lastDate: last }).where(eq(r.id, tpl.id)).run();
      }
    });
  }

  generate();

  app.get("/api/recurring", (c) => c.json(templates().orderBy(r.id).all()));

  app.post("/api/recurring", async (c) => {
    const t = readTemplate(await json(c), settings().lastCurrency, uncategorised(db));
    if ("error" in t) return c.json(t, 400);
    const { id } = db.insert(r).values(t).returning({ id: r.id }).get();
    generate();
    return c.json(templates(eq(r.id, id)).get(), 201);
  });

  app.put("/api/recurring/:id", async (c) => {
    const id = Number(c.req.param("id"));
    const old = templates(eq(r.id, id)).get();
    if (!old) return c.json({ error: "not found" }, 404);
    const t = readTemplate(await json(c), old.currency, old.categoryId);
    if ("error" in t) return c.json(t, 400);
    db.update(r).set(t).where(eq(r.id, id)).run();
    generate();
    return c.json(templates(eq(r.id, id)).get());
  });

  const setTemplate = (c: Context, set: Partial<typeof r.$inferInsert>) => {
    const id = Number(c.req.param("id"));
    return db.update(r).set(set).where(and(eq(r.id, id), isNull(r.deletedAt))).returning({ id: r.id }).get()
      ? c.json(templates(eq(r.id, id)).get() ?? {})
      : c.json({ error: "not found" }, 404);
  };

  app.post("/api/recurring/:id/pause", (c) => setTemplate(c, { paused: true }));
  app.post("/api/recurring/:id/resume", (c) => (generate(c.req.param("id")), setTemplate(c, { paused: false })));
  app.delete("/api/recurring/:id", (c) => setTemplate(c, { deletedAt: clock().toISOString() }));

  app.route("/api/chats", chats(ctx, value));
  app.all("/api/*", (c) => c.json({ error: "not found" }, 404));

  return Object.assign(app, { generate: () => generate() });
}

function next(last: string, { period, every, startDate }: typeof t.recurring.$inferSelect) {
  const [y, m, d] = last.split("-").map(Number);
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  if (period === "day" || period === "week") return iso(new Date(Date.UTC(y, m - 1, d + every * (period === "week" ? 7 : 1))));
  const month = m - 1 + every * (period === "year" ? 12 : 1);
  return iso(new Date(Date.UTC(y, month, Math.min(Number(startDate.slice(8)), new Date(Date.UTC(y, month + 1, 0)).getUTCDate()))));
}
