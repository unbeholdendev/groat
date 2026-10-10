import type { Database, SQLQueryBindings } from "bun:sqlite";
import { type Context, Hono } from "hono";
import { formatAmount, parseAmount } from "../shared/amount";
import { countable, isDate, migrate, settings as stored, today, uncategorised, visible } from "./db";
import { aiEnabled, chats } from "./ai";
import { valuer } from "./rates";
import { groups, stats } from "./stats";

export type Deps = {
  db: Database;
  clock: () => Date;
  fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  config: { aiBaseUrl?: string; aiApiKey?: string; aiModel?: string };
};

const defaultCategories: [string, string, string, [string, string][]?][] = [
  ["Food", "🍽️", "#f97316", [["Groceries", "🛒"], ["Eating out", "🍔"]]],
  ["Transport", "🚗", "#3b82f6", [["Fuel", "⛽"], ["Public transport", "🚆"], ["Taxi", "🚕"]]],
  ["Home", "🏠", "#8b5cf6", [["Rent/Mortgage", "🔑"], ["Utilities", "💡"], ["Maintenance", "🔧"]]],
  ["Subscriptions", "🔁", "#06b6d4"],
  ["Health", "💊", "#ef4444"],
  ["Shopping", "🛍️", "#ec4899"],
  ["Entertainment", "🎬", "#eab308"],
  ["Travel", "✈️", "#14b8a6"],
  ["Gifts", "🎁", "#f43f5e"],
];

const knownCurrencies = new Set([...Intl.supportedValuesOf("currency"), "BTC"]);

function shortlist(base: unknown, list: unknown) {
  if (!Array.isArray(list) || !list.every((c) => knownCurrencies.has(c)) || !knownCurrencies.has(base as string))
    return null;
  return [...new Set([base as string, ...list])];
}

const expenseSql = `SELECT id, note, amount, currency, date, category_id AS categoryId, status, recurring_id AS recurringId,
  (SELECT json_group_array(name) FROM (SELECT name FROM expense_tags JOIN tags ON tags.id = tag_id
    WHERE expense_id = expenses.id ORDER BY name)) AS tags
  FROM expenses`;

export const expenses = (db: Database, where: string, ...params: SQLQueryBindings[]) =>
  (db.query(`${expenseSql} WHERE ${where}`).all(...params) as { amount: number; currency: string; date: string; note: string; categoryId: number; tags: string }[]).map((e) => ({
    ...e,
    tags: JSON.parse(e.tags) as string[],
  }));

export const json = (c: Context) => c.req.json().catch(() => ({}));

export function expenseFilter(q: Record<string, string>, base = visible) {
  const where = [base];
  const params: string[] = [];
  const add = (value: string | undefined, sql: string) => {
    if (!value) return;
    where.push(sql);
    params.push(value);
  };
  add(q.from, "date >= ?");
  add(q.to, "date <= ?");
  add(q.category, "category_id IN (SELECT id FROM categories WHERE CAST(? AS INTEGER) IN (id, parent_id))");
  add(q.tag, "id IN (SELECT expense_id FROM expense_tags JOIN tags ON tags.id = tag_id WHERE name = ?)");
  add(q.currency, "currency = ?");
  add(q.q, "instr(lower(note), lower(?))");
  return { where: where.join(" AND "), params };
}

export function readExpense(body: Record<string, any>, db: Database, today: string, fallback: string, currencies: string[], category: number) {
  const note = typeof body.note === "string" ? body.note.trim() : "";
  const currency = body.currency ?? fallback;
  if (currency !== fallback && !currencies.includes(currency)) return { error: "currency not enabled" };
  const amount = typeof body.amount === "string" ? parseAmount(body.amount, currency, body.unit) : null;
  const date = body.date ?? today;
  const categoryId = body.categoryId ?? category;
  const tags = body.tags ?? [];
  if (!note) return { error: "note is required" };
  if (amount === null) return { error: "invalid amount" };
  if (!isDate(date) || date > today) return { error: "invalid date" };
  if (!db.query("SELECT 1 FROM categories WHERE id = ?").get(categoryId)) return { error: "invalid category" };
  if (!Array.isArray(tags) || !tags.every((t) => typeof t === "string" && t.trim())) return { error: "invalid tags" };
  return { note, amount, currency, date, categoryId, tags: [...new Set(tags.map((t: string) => t.trim()))] };
}

export function createApp(deps: Deps) {
  const { db, clock, fetch, config } = deps;
  migrate(db);
  const app = new Hono();
  const value = valuer(deps);

  for (const file of ["sw.js", "manifest.webmanifest"])
    app.get(`/${file}`, () => new Response(Bun.file(`${import.meta.dir}/${file}`)));

  app.use("/api/*", async (c, next) => {
    await next();
    c.header("cache-control", "no-store");
  });

  const settings = () => ({ ...stored(db), ai: aiEnabled(config) });

  const saveTags = (id: number, tags: string[]) => {
    db.query("DELETE FROM expense_tags WHERE expense_id = ?").run(id);
    for (const name of tags) {
      db.query("INSERT INTO tags (name) VALUES (?) ON CONFLICT DO NOTHING").run(name);
      db.query("INSERT INTO expense_tags SELECT ?, id FROM tags WHERE name = ?").run(id, name);
    }
  };

  app.get("/api/settings", (c) => c.json(settings()));

  app.put("/api/settings", async (c) => {
    const { baseCurrency, currencies, theme } = { ...settings(), ...(await json(c)) };
    const list = shortlist(baseCurrency, currencies);
    if (!list) return c.json({ error: "invalid currencies" }, 400);
    if (!["system", "light", "dark"].includes(theme)) return c.json({ error: "invalid theme" }, 400);
    db.query("UPDATE settings SET base_currency = ?, currencies = ?, theme = ?").run(baseCurrency, JSON.stringify(list), theme);
    return c.json(settings());
  });

  app.post("/api/onboarding", async (c) => {
    if (settings().onboarded) return c.json({ error: "already onboarded" }, 409);
    const body = await json(c);
    const currencies = shortlist(body.baseCurrency, body.currencies);
    if (!currencies) return c.json({ error: "invalid currencies" }, 400);
    const insert = db.query("INSERT INTO categories (name, icon, color, parent_id, sort) VALUES (?, ?, ?, ?, ?) RETURNING id");
    db.transaction(() => {
      db.query("UPDATE settings SET base_currency = ?, currencies = ?, onboarded = 1").run(
        body.baseCurrency,
        JSON.stringify(currencies),
      );
      defaultCategories.forEach(([name, icon, color, children = []], i) => {
        const { id } = insert.get(name, icon, color, null, i) as { id: number };
        children.forEach(([child, childIcon], j) => insert.run(child, childIcon, color, id, j));
      });
    })();
    return c.json(settings());
  });

  const categories = (where: string, ...params: SQLQueryBindings[]) =>
    (
      db
        .query(`SELECT id, name, icon, color, parent_id AS parentId, builtin FROM categories WHERE ${where}`)
        .all(...params) as { id: number; name: string; parentId: number | null; builtin: number }[]
    ).map((r) => ({ ...r, builtin: r.builtin === 1 }));

  const filled = (...values: unknown[]) => values.every((v) => typeof v === "string" && v.trim());

  app.get("/api/categories", (c) => c.json(categories("1 ORDER BY parent_id IS NOT NULL, sort")));

  app.post("/api/categories", async (c) => {
    const { name, icon, color, parentId = null } = await json(c);
    if (!filled(name, icon, color)) return c.json({ error: "name, icon and colour are required" }, 400);
    if (parentId !== null && !db.query("SELECT 1 FROM categories WHERE id = ? AND parent_id IS NULL").get(parentId))
      return c.json({ error: "invalid parent" }, 400);
    const { id } = db
      .query(
        `INSERT INTO categories (name, icon, color, parent_id, sort)
        VALUES (?1, ?2, ?3, ?4, (SELECT coalesce(max(sort), -1) + 1 FROM categories WHERE parent_id IS ?4)) RETURNING id`,
      )
      .get(name.trim(), icon, color, parentId) as { id: number };
    return c.json(categories("id = ?", id)[0], 201);
  });

  app.put("/api/categories/order", async (c) => {
    const ids = await json(c);
    if (!Array.isArray(ids) || !ids.every(Number.isInteger)) return c.json({ error: "expected a list of ids" }, 400);
    db.transaction(() => ids.forEach((id, i) => db.query("UPDATE categories SET sort = ? WHERE id = ?").run(i, id)))();
    return c.json({});
  });

  app.put("/api/categories/:id", async (c) => {
    const [old] = categories("id = ?", c.req.param("id"));
    if (!old) return c.json({ error: "not found" }, 404);
    const { name, icon, color } = { ...old, ...(await json(c)) };
    if (!filled(name, icon, color)) return c.json({ error: "name, icon and colour are required" }, 400);
    db.query("UPDATE categories SET name = ?, icon = ?, color = ? WHERE id = ?").run(name.trim(), icon, color, c.req.param("id"));
    return c.json(categories("id = ?", c.req.param("id"))[0]);
  });

  app.delete("/api/categories/:id", (c) => {
    const id = Number(c.req.param("id"));
    const [old] = categories("id = ?", id);
    if (!old) return c.json({ error: "not found" }, 404);
    if (old.builtin) return c.json({ error: "Uncategorised cannot be deleted" }, 400);
    const moveTo = Number(c.req.query("moveTo") ?? uncategorised(db));
    if (!db.query("SELECT 1 FROM categories WHERE id = ?1 AND id != ?2 AND parent_id IS NOT ?2").get(moveTo, id))
      return c.json({ error: "invalid moveTo" }, 400);
    db.transaction(() => {
      for (const table of ["expenses", "recurring"])
        db.query(`UPDATE ${table} SET category_id = ?1 WHERE category_id IN (SELECT id FROM categories WHERE ?2 IN (id, parent_id))`).run(
          moveTo,
          id,
        );
      db.query("DELETE FROM categories WHERE parent_id = ?").run(id);
      db.query("DELETE FROM categories WHERE id = ?").run(id);
    })();
    return c.json({});
  });

  app.get("/api/tags", (c) => c.json(db.query("SELECT id, name FROM tags ORDER BY name").all()));

  app.put("/api/tags/:id", async (c) => {
    const { name } = await json(c);
    if (!filled(name)) return c.json({ error: "name is required" }, 400);
    if (db.query("SELECT 1 FROM tags WHERE name = ? AND id != ?").get(name.trim(), c.req.param("id")))
      return c.json({ error: "tag already exists" }, 409);
    const old = retag(c.req.param("id"), name.trim());
    return old ? c.json({ id: old.id, name: name.trim() }) : c.json({ error: "not found" }, 404);
  });

  app.delete("/api/tags/:id", (c) => (retag(c.req.param("id"), null) ? c.json({}) : c.json({ error: "not found" }, 404)));

  const retag = (id: string, name: string | null) =>
    db.transaction(() => {
      const old = db.query("SELECT id, name FROM tags WHERE id = ?").get(id) as { id: number; name: string } | null;
      if (!old) return null;
      db.query(
        `UPDATE recurring SET tags = (SELECT json_group_array(CASE WHEN value = ?1 THEN ?2 ELSE value END)
        FROM json_each(recurring.tags) WHERE ?2 IS NOT NULL OR value != ?1)`,
      ).run(old.name, name);
      if (name === null) db.query("DELETE FROM tags WHERE id = ?").run(id);
      else db.query("UPDATE tags SET name = ? WHERE id = ?").run(name, id);
      return old;
    })();

  app.get("/api/expenses", async (c) => {
    const { where, params } = expenseFilter(c.req.query());
    const rows = expenses(db, `${where} ORDER BY date DESC, id DESC`, ...params);
    return c.json(await value(rows));
  });

  app.get("/api/export", async (c) => {
    const { where, params } = expenseFilter(c.req.query(), countable);
    const rows = expenses(db, `${where} ORDER BY date DESC, id DESC`, ...params);
    const { baseCurrency } = settings();
    const cats = new Map(categories("1").map((r) => [r.id, r] as [number, { name: string; parentId: number | null }]));
    const cell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);
    const lines = (await value(rows)).map((e) => {
      const cat = cats.get(e.categoryId)!;
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

  app.get("/api/notes", (c) =>
    c.json(
      db
        .query(
          `SELECT note, categoryId, currency, amount FROM (
            SELECT note, category_id AS categoryId, currency, amount, date, id,
              row_number() OVER (PARTITION BY note ORDER BY date DESC, id DESC) AS n
            FROM expenses WHERE ${visible} AND lower(substr(note, 1, length(?1))) = lower(?1))
          WHERE n = 1 ORDER BY date DESC, id DESC LIMIT 10`,
        )
        .all(c.req.query("prefix") ?? ""),
    ),
  );

  app.put("/api/rates", async (c) => {
    const { date, currency, rate } = await json(c);
    if (!isDate(date) || !knownCurrencies.has(currency) || typeof rate !== "string" || !/^\d+(\.\d+)?$/.test(rate) || !Number(rate))
      return c.json({ error: "invalid rate" }, 400);
    db.query("INSERT OR REPLACE INTO rates (date, currency, rate, source) VALUES (?, ?, ?, 'manual')").run(date, currency, Number(rate));
    return c.json({ date, currency, rate: Number(rate) });
  });

  app.get("/api/bin", (c) => c.json(expenses(db, "deleted_at IS NOT NULL ORDER BY deleted_at DESC, id DESC")));

  app.post("/api/expenses", async (c) => {
    const now = clock().toISOString();
    const { lastCurrency, currencies } = settings();
    const e = readExpense(await json(c), db, today(clock), lastCurrency, currencies, uncategorised(db));
    if ("error" in e) return c.json(e, 400);
    const { id } = db
      .query(
        "INSERT INTO expenses (note, amount, currency, date, category_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id",
      )
      .get(e.note, e.amount, e.currency, e.date, e.categoryId, now, now) as { id: number };
    saveTags(id, e.tags);
    return c.json(expenses(db, "id = ?", id)[0], 201);
  });

  app.put("/api/expenses/:id", async (c) => {
    const now = clock().toISOString();
    const id = c.req.param("id");
    const old = db.query("SELECT currency, category_id FROM expenses WHERE id = ? AND deleted_at IS NULL").get(id) as
      | { currency: string; category_id: number }
      | null;
    if (!old) return c.json({ error: "not found" }, 404);
    const e = readExpense(await json(c), db, today(clock), old.currency, settings().currencies, old.category_id);
    if ("error" in e) return c.json(e, 400);
    db.query("UPDATE expenses SET note = ?, amount = ?, currency = ?, date = ?, category_id = ?, updated_at = ? WHERE id = ?").run(
      e.note,
      e.amount,
      e.currency,
      e.date,
      e.categoryId,
      now,
      id,
    );
    saveTags(Number(id), e.tags);
    return c.json(expenses(db, "id = ?", id)[0]);
  });

  app.delete("/api/expenses/:id", (c) => {
    const done = db
      .query("UPDATE expenses SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL RETURNING id")
      .get(clock().toISOString(), c.req.param("id"));
    return done ? c.json(expenses(db, "id = ?", c.req.param("id"))[0]) : c.json({ error: "not found" }, 404);
  });

  app.post("/api/expenses/:id/confirm", (c) =>
    db.query("UPDATE expenses SET status = 'normal' WHERE id = ? AND deleted_at IS NULL RETURNING id").get(c.req.param("id"))
      ? c.json(expenses(db, "id = ?", c.req.param("id"))[0])
      : c.json({ error: "not found" }, 404),
  );

  app.post("/api/bin/:id/restore", (c) => {
    const done = db
      .query("UPDATE expenses SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL RETURNING id")
      .get(c.req.param("id"));
    return done ? c.json(expenses(db, "id = ?", c.req.param("id"))[0]) : c.json({ error: "not found" }, 404);
  });

  app.delete("/api/bin", (c) => {
    db.run("DELETE FROM expenses WHERE deleted_at IS NOT NULL");
    return c.json({});
  });

  const templates = (where: string, ...params: SQLQueryBindings[]) =>
    (
      db
        .query(
          `SELECT id, note, amount, currency, category_id AS categoryId, tags, period, every, start_date AS startDate,
          end_date AS endDate, needs_confirmation AS needsConfirmation, paused, last_date AS lastDate
          FROM recurring WHERE deleted_at IS NULL AND ${where}`,
        )
        .all(...params) as { tags: string; needsConfirmation: number; paused: number; currency: string; categoryId: number }[]
    ).map((r) => ({ ...r, tags: JSON.parse(r.tags) as string[], needsConfirmation: r.needsConfirmation === 1, paused: r.paused === 1 }));

  const readTemplate = (body: Record<string, any>, fallback: string, category: number) => {
    const e = readExpense({ ...body, date: today(clock) }, db, today(clock), fallback, settings().currencies, category);
    if (e.error) return { error: e.error };
    const { period, every, startDate = today(clock), endDate = null, needsConfirmation = false } = body;
    if (!["day", "week", "month", "year"].includes(period) || !Number.isInteger(every) || every < 1) return { error: "invalid schedule" };
    if (!isDate(startDate)) return { error: "invalid date" };
    if (endDate !== null && !isDate(endDate)) return { error: "invalid end date" };
    return [e.note!, e.amount, e.currency, e.categoryId, JSON.stringify(e.tags), period, every, startDate, endDate, needsConfirmation ? 1 : 0];
  };

  function generate(skip?: string) {
    const now = clock().toISOString();
    const insert = db.query(
      `INSERT INTO expenses (note, amount, currency, date, category_id, recurring_id, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    );
    const rows = (
      skip
        ? db.query("SELECT * FROM recurring WHERE id = ?").all(skip)
        : db.query("SELECT * FROM recurring WHERE deleted_at IS NULL AND paused = 0").all()
    ) as Record<string, any>[];
    db.transaction(() => {
      for (const r of rows) {
        let last = r.last_date;
        for (let d; (d = last && last >= r.start_date ? next(last, r) : r.start_date) <= today(clock) && (!r.end_date || d <= r.end_date); last = d) {
          if (skip) continue;
          const status = r.needs_confirmation ? "pending" : "normal";
          const { id } = insert.get(r.note, r.amount, r.currency, d, r.category_id, r.id, status, now, now) as { id: number };
          saveTags(id, JSON.parse(r.tags));
        }
        db.query("UPDATE recurring SET last_date = ? WHERE id = ?").run(last, r.id);
      }
    })();
  }

  generate();

  app.get("/api/recurring", (c) => c.json(templates("1 ORDER BY id")));

  app.post("/api/recurring", async (c) => {
    const t = readTemplate(await json(c), settings().lastCurrency, uncategorised(db));
    if ("error" in t) return c.json(t, 400);
    const { id } = db
      .query(
        `INSERT INTO recurring (note, amount, currency, category_id, tags, period, every, start_date, end_date, needs_confirmation)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      )
      .get(...t) as { id: number };
    generate();
    return c.json(templates("id = ?", id)[0], 201);
  });

  app.put("/api/recurring/:id", async (c) => {
    const id = c.req.param("id");
    const [old] = templates("id = ?", id);
    if (!old) return c.json({ error: "not found" }, 404);
    const t = readTemplate(await json(c), old.currency, old.categoryId);
    if ("error" in t) return c.json(t, 400);
    db.query(
      `UPDATE recurring SET note = ?, amount = ?, currency = ?, category_id = ?, tags = ?, period = ?, every = ?, start_date = ?,
      end_date = ?, needs_confirmation = ? WHERE id = ?`,
    ).run(...t, id);
    generate();
    return c.json(templates("id = ?", id)[0]);
  });

  const setTemplate = (c: Context, set: string, ...params: SQLQueryBindings[]) => {
    const id = c.req.param("id")!;
    return db.query(`UPDATE recurring SET ${set} WHERE id = ? AND deleted_at IS NULL RETURNING id`).get(...params, id)
      ? c.json(templates("id = ?", id)[0] ?? {})
      : c.json({ error: "not found" }, 404);
  };

  app.post("/api/recurring/:id/pause", (c) => setTemplate(c, "paused = 1"));
  app.post("/api/recurring/:id/resume", (c) => (generate(c.req.param("id")), setTemplate(c, "paused = 0")));
  app.delete("/api/recurring/:id", (c) => setTemplate(c, "deleted_at = ?", clock().toISOString()));

  app.route("/api/chats", chats(deps, value));
  app.all("/api/*", (c) => c.json({ error: "not found" }, 404));

  return Object.assign(app, { generate: () => generate() });
}

function next(last: string, { period, every, start_date }: Record<string, any>) {
  const [y, m, d] = last.split("-").map(Number);
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  if (period === "day" || period === "week") return iso(new Date(Date.UTC(y, m - 1, d + every * (period === "week" ? 7 : 1))));
  const month = m - 1 + every * (period === "year" ? 12 : 1);
  return iso(new Date(Date.UTC(y, month, Math.min(Number(start_date.slice(8)), new Date(Date.UTC(y, month + 1, 0)).getUTCDate()))));
}
