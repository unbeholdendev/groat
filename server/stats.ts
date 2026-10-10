import { and, between } from "drizzle-orm";
import { countable, type Db, settings } from "./db";
import type { Valuer } from "./rates";
import { categories as c, expenses as e } from "./schema";

export const groups = ["day", "week", "month"] as const;
type Group = (typeof groups)[number];
type Category = { id: number; name: string; icon: string; color: string; parentId: number | null };
type Total = { total: number };

const shift = (date: string, days: number) => {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const bucketOf = (date: string, group: Group) =>
  group === "month" ? `${date.slice(0, 7)}-01` : group === "week" ? shift(date, -((new Date(date).getUTCDay() + 6) % 7)) : date;

const nextBucket = (start: string, group: Group) => {
  if (group !== "month") return shift(start, group === "week" ? 7 : 1);
  const d = new Date(start);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
};

const byTotal = (a: Total, b: Total) => b.total - a.total;

export async function period(db: Db, value: Valuer, from: string, to: string, group: Group) {
  const rows = db
    .select({ amount: e.amount, currency: e.currency, date: e.date, categoryId: e.categoryId })
    .from(e)
    .where(and(countable, between(e.date, from, to)))
    .all();
  const valued = await value(rows);
  const counted = valued.filter((r): r is (typeof valued)[number] & { baseAmount: number } => r.baseAmount !== null);
  const sum = (rs: { baseAmount: number }[]) => rs.reduce((s, r) => s + r.baseAmount, 0);

  const all: Category[] = db.select({ id: c.id, name: c.name, icon: c.icon, color: c.color, parentId: c.parentId }).from(c).all();
  const categories = all
    .filter((p) => p.parentId === null)
    .map((p) => {
      const children = all
        .filter((c) => c.id === p.id || c.parentId === p.id)
        .map((c) => ({ ...c, total: sum(counted.filter((r) => r.categoryId === c.id)) }))
        .filter((c) => c.total)
        .sort(byTotal);
      return { ...p, total: children.reduce((s, c) => s + c.total, 0), children };
    })
    .filter((c) => c.total)
    .sort(byTotal);

  const buckets = new Map<string, number>();
  for (let start = bucketOf(from, group); start <= to; start = nextBucket(start, group)) buckets.set(start, 0);
  for (const r of counted) {
    const start = bucketOf(r.date, group);
    buckets.set(start, buckets.get(start)! + r.baseAmount);
  }

  return {
    from,
    to,
    baseCurrency: settings(db).baseCurrency,
    total: sum(counted),
    unconverted: valued.length - counted.length,
    categories,
    buckets: [...buckets].map(([start, total]) => ({ start, total })),
  };
}

export async function stats(db: Db, value: Valuer, from: string, to: string, group: Group) {
  const days = (Date.parse(to) - Date.parse(from)) / 864e5 + 1;
  return {
    ...(await period(db, value, from, to, group)),
    previous: await period(db, value, shift(from, -days), shift(from, -1), group),
  };
}
