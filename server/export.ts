import { Hono } from "hono";
import { formatAmount } from "../shared/amount";
import { categories } from "./categories";
import { countable, type Db, settings } from "./db";
import { expenseFilter, expenseQuery, expenses, newest } from "./expenses";
import type { Valuer } from "./rates";
import { query } from "./request";

export function exportRoutes(db: Db, value: Valuer) {
  const app = new Hono();

  app.get("/api/export", async (c) => {
    const q = query(c, expenseQuery);
    if ("error" in q) return c.json(q, 400);
    const rows = expenses(db, expenseFilter(db, q.data, countable)).orderBy(...newest).all();
    const { baseCurrency } = settings(db);
    const cats = new Map(categories(db).all().map((r) => [r.id, r]));
    const cell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);
    const lines = (await value(rows)).map((e) => {
      const cat = e.categoryId === null ? undefined : cats.get(e.categoryId);
      const parent = cat?.parentId ? cats.get(cat.parentId) : undefined;
      const [category, sub] = cat && parent ? [parent.name, cat.name] : [cat?.name ?? "", ""];
      const base = e.baseAmount === null ? "" : formatAmount(e.baseAmount, baseCurrency);
      return [e.date, e.note, formatAmount(e.amount, e.currency), e.currency, base, baseCurrency, category, sub, e.tags.join(", ")];
    });
    const header = ["date", "note", "amount", "currency", "base amount", "base currency", "category", "subcategory", "tags"];
    return c.body([header, ...lines].map((l) => `${l.map(cell).join(",")}\r\n`).join(""), 200, { "content-type": "text/csv; charset=utf-8" });
  });

  return app;
}
