import { Hono } from "hono";
import { formatAmount } from "../shared/amount";
import { categories } from "./categories";
import { countable, type Db, settings } from "./db";
import { expenseFilter, expenses, newest } from "./expenses";
import type { Valuer } from "./rates";

export function exportRoutes(db: Db, value: Valuer) {
  const app = new Hono();

  app.get("/api/export", async (c) => {
    const rows = expenses(db, expenseFilter(db, c.req.query(), countable)).orderBy(...newest).all();
    const { baseCurrency } = settings(db);
    const cats = new Map(categories(db).all().map((r) => [r.id, r]));
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

  return app;
}
