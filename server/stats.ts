import { and, between, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { isoDate, type Kind } from "../shared/schema";
import { countable, type Db, kindOf, settings } from "./db";
import type { Valuer } from "./rates";
import { query } from "./request";
import { categories as c, transactions as e, transactionTags as et, tags as tg } from "./schema";

const range = z
  .object({ from: isoDate, to: isoDate, group: z.enum(["day", "week", "month"]).default("day") })
  .refine((r) => r.from <= r.to);
type Group = z.infer<typeof range>["group"];
type Category = { id: number; name: string; icon: string; color: string; parentId: number | null; kind: Kind };
type Total = { total: number };

const shift = (date: string, days: number) => {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const bucketOf = (date: string, group: Group) =>
  group === "month"
    ? `${date.slice(0, 7)}-01`
    : group === "week"
      ? shift(date, -((new Date(date).getUTCDay() + 6) % 7))
      : date;

const nextBucket = (start: string, group: Group) => {
  if (group !== "month") return shift(start, group === "week" ? 7 : 1);
  const d = new Date(start);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
};

const byTotal = (a: Total, b: Total) => b.total - a.total;

export async function period(db: Db, value: Valuer, from: string, to: string, group: Group) {
  const rows = db
    .select({ id: e.id, amount: e.amount, currency: e.currency, date: e.date, categoryId: e.categoryId, kind: kindOf })
    .from(e)
    .where(and(countable, between(e.date, from, to)))
    .all();
  const valued = await value(rows);
  const rated = valued.filter((r): r is (typeof valued)[number] & { baseAmount: number } => r.baseAmount !== null);
  const counted = rated.filter((r) => r.kind === "expense");
  const earned = rated.filter((r) => r.kind === "income");
  const sum = (rs: { baseAmount: number }[]) => rs.reduce((s, r) => s + r.baseAmount, 0);

  const all: Category[] = db
    .select({ id: c.id, name: c.name, icon: c.icon, color: c.color, parentId: c.parentId, kind: c.kind })
    .from(c)
    .all();
  const breakdown = (kind: Kind, rs: { categoryId: number | null; baseAmount: number }[]) =>
    all
      .filter((p) => p.parentId === null && p.kind === kind)
      .map(({ kind, ...p }) => {
        const children = all
          .filter((c) => c.id === p.id || c.parentId === p.id)
          .map(({ kind, ...c }) => ({ ...c, total: sum(rs.filter((r) => r.categoryId === c.id)) }))
          .filter((c) => c.total)
          .sort(byTotal);
        return { ...p, total: children.reduce((s, c) => s + c.total, 0), children };
      })
      .filter((c) => c.total)
      .sort(byTotal);

  const amounts = new Map(counted.map((r) => [r.id, r.baseAmount]));
  const tagged = new Map<string, number>();
  for (const { id, name } of db
    .select({ id: et.transactionId, name: tg.name })
    .from(et)
    .innerJoin(tg, eq(tg.id, et.tagId))
    .innerJoin(e, eq(e.id, et.transactionId))
    .where(and(countable, between(e.date, from, to)))
    .all()) {
    const amount = amounts.get(id);
    if (amount !== undefined) tagged.set(name, (tagged.get(name) ?? 0) + amount);
  }
  const tags = [...tagged].map(([name, total]) => ({ name, total })).sort(byTotal);

  const buckets = new Map<string, number>();
  for (let start = bucketOf(from, group); start <= to; start = nextBucket(start, group)) buckets.set(start, 0);
  for (const r of counted) {
    const start = bucketOf(r.date, group);
    buckets.set(start, (buckets.get(start) ?? 0) + r.baseAmount);
  }

  return {
    from,
    to,
    baseCurrency: settings(db).baseCurrency,
    total: sum(counted),
    unconverted: valued.length - rated.length,
    categories: breakdown("expense", counted),
    tags,
    buckets: [...buckets].map(([start, total]) => ({ start, total })),
    income: { total: sum(earned), categories: breakdown("income", earned) },
  };
}

export async function stats(db: Db, value: Valuer, from: string, to: string, group: Group) {
  const days = (Date.parse(to) - Date.parse(from)) / 864e5 + 1;
  return {
    ...(await period(db, value, from, to, group)),
    previous: await period(db, value, shift(from, -days), shift(from, -1), group),
  };
}

export function statsRoutes(db: Db, value: Valuer) {
  const app = new Hono();

  app.get("/api/stats", async (c) => {
    const q = query(c, range);
    if ("error" in q) return c.json({ error: "Invalid date range" }, 400);
    const { from, to, group } = q.data;
    return c.json(await stats(db, value, from, to, group));
  });

  return app;
}
