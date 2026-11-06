import { eq, sql } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { formatAmount } from "../shared/amount";
import type { Ctx } from "./app";
import type { Env } from "./auth";
import { type Db, settings, today, uncategorised } from "./db";
import { addTransaction, readTransaction } from "./transactions";
import { valid } from "./request";
import * as t from "./schema";

const required = ["date", "note", "amount", "currency"];
const upload = z.object({ file: z.file() });
const cat = t.categories;

function parseCsv(text: string) {
  const rows: { line: number; cells: string[] }[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = 0;
  let line = 1;
  let start = 1;
  const end = () => (cells.push(cell), (cell = ""));
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const newline = ch === "\n" || (ch === "\r" && text[i + 1] !== "\n");
    if (quoted) {
      if (ch !== '"') cell += ch;
      else if (text[i + 1] === '"') (cell += '"'), i++;
      else quoted = 0;
    } else if (ch === '"') quoted = line;
    else if (ch === ",") end();
    else if (ch !== "\r" && ch !== "\n") cell += ch;
    if (newline && !quoted) {
      end();
      rows.push({ line: start, cells });
      cells = [];
      start = line + 1;
    }
    if (newline) line++;
  }
  if (quoted) return { error: `Line ${quoted} opens a quote that is never closed` };
  if (cell || cells.length) end(), rows.push({ line: start, cells });
  return { rows };
}

const trimZeros = (amount: string) => (amount.includes(".") ? amount.replace(/0+$/, "").replace(/\.$/, "") : amount);
const key = (...names: string[]) => names.map((n) => n.toLowerCase()).join("\n");

function plan(db: Db, text: string, date: string) {
  const csv = parseCsv(text.replace(/^﻿/, ""));
  if (csv.error !== undefined) return { error: csv.error };
  const [header, ...lines] = csv.rows;
  const column = new Map((header?.cells ?? []).map((name, i) => [name.trim().toLowerCase(), i]));
  if (required.some((name) => !column.has(name))) return { error: "The file needs date, note, amount and currency columns" };

  const existing = new Map<string, number>();
  const all = db.select({ id: cat.id, name: cat.name, parentId: cat.parentId }).from(cat).all();
  for (const c of all) {
    const parent = all.find((p) => p.id === c.parentId);
    existing.set(parent ? key(parent.name, c.name) : key(c.name), c.id);
  }
  const fallback = uncategorised(db);
  const { baseCurrency } = settings(db);
  const created = new Map<string, [string, string?]>();
  const rows = [];
  const rejected = [];
  for (const { line, cells } of lines) {
    if (cells.every((cell) => !cell.trim())) continue;
    const cell = (name: string) => cells[column.get(name) ?? -1]?.trim() ?? "";
    const tags = cell("tags").split(",").map((tag) => tag.trim()).filter(Boolean);
    const input = { note: cell("note"), amount: trimZeros(cell("amount")), currency: cell("currency"), date: cell("date"), tags };
    const read = !input.date
      ? { error: "Invalid date" }
      : !input.currency
        ? { error: "Invalid currency" }
        : readTransaction(input, db, date, baseCurrency, fallback);
    if ("error" in read) {
      rejected.push({ line, error: read.error });
      continue;
    }
    const [category, sub] = [cell("category"), cell("subcategory")];
    if (category && !existing.has(key(category)) && !created.has(key(category))) created.set(key(category), [category]);
    if (category && sub && !existing.has(key(category, sub)) && !created.has(key(category, sub))) created.set(key(category, sub), [category, sub]);
    rows.push({ ...read, at: !category ? undefined : sub ? key(category, sub) : key(category) });
  }

  const totals = new Map<string, number>();
  for (const r of rows) totals.set(r.currency, (totals.get(r.currency) ?? 0) + r.amount);
  return {
    rows,
    created,
    existing,
    preview: {
      count: rows.length,
      totals: [...totals].sort(([a], [b]) => a.localeCompare(b)).map(([currency, amount]) => ({ currency, amount: formatAmount(amount, currency) })),
      categories: [...created.values()].map((path) => path.join(" › ")),
      rejected,
    },
  };
}

export function importRoutes({ db, clock }: Ctx) {
  const app = new Hono<Env>();
  const used = "Import only works before any expenses are added";
  const empty = () => !db.$client.query("SELECT 1 FROM transactions UNION ALL SELECT 1 FROM recurring UNION ALL SELECT 1 FROM tags").get();

  const limit = bodyLimit({ maxSize: 20 * 1024 * 1024, onError: (c) => c.json({ error: "That file is too large" }, 413) });

  const read = async (c: Context<Env>) => {
    if (c.get("user").role !== "admin") return c.json({ error: "Only admins can do that" }, 403);
    const parsed = valid(upload, await c.req.parseBody().catch(() => undefined));
    if ("error" in parsed) return c.json({ error: "Choose a CSV file" }, 400);
    const text = await parsed.data.file.text();
    if (!empty()) return c.json({ error: used }, 409);
    const result = plan(db, text, today(clock));
    if ("error" in result) return c.json(result, 400);
    return result;
  };

  app.post("/api/import/preview", limit, async (c) => {
    const result = await read(c);
    return result instanceof Response ? result : c.json(result.preview);
  });

  app.post("/api/import", limit, async (c) => {
    const result = await read(c);
    if (result instanceof Response) return result;
    if (result.preview.rejected.length) return c.json({ error: "Fix the rejected rows, then import again" }, 400);
    // read() awaited the upload after its check, so another import may have finished since.
    if (!empty()) return c.json({ error: used }, 409);
    const { rows, created, existing } = result;
    const now = clock().toISOString();
    const userId = c.get("user").id;
    db.transaction(() => {
      const parents = [...created.values()].sort((a, b) => a.length - b.length);
      for (const [name, sub] of parents) {
        const parentId = sub ? existing.get(key(name))! : null;
        const color = parentId ? db.select({ color: cat.color }).from(cat).where(eq(cat.id, parentId)).get()!.color : "#71717a";
        const sort = sql`(SELECT coalesce(max(sort), -1) + 1 FROM categories WHERE parent_id IS ${parentId})`;
        const { id } = db.insert(cat).values({ name: sub ?? name, icon: "🏷️", color, parentId, sort }).returning({ id: cat.id }).get();
        existing.set(sub ? key(name, sub) : key(name), id);
      }
      for (const { at, ...row } of rows) addTransaction(db, now, { ...row, categoryId: at ? existing.get(at)! : row.categoryId }, userId);
    });
    return c.json({ imported: rows.length });
  });

  return app;
}
