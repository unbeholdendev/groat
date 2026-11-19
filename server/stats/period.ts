import { and, between, eq } from "drizzle-orm";
import { z } from "zod";
import { isoDate, type Kind } from "../../shared/schema";
import { type Ctx, today } from "../context";
import * as schema from "../schema";
import { settings } from "../settings/queries";
import { countable, kindOf, taggedWith } from "../transactions/queries";

export const range = z
  .object({
    from: isoDate,
    to: isoDate,
    group: z.enum(["day", "week", "month"]).default("day"),
    tag: z.string().min(1).optional(),
  })
  .refine((r) => r.from <= r.to);
type Group = z.infer<typeof range>["group"];
type Category = { id: number; name: string; icon: string; color: string; parentId: number | null; kind: Kind };
type Total = { total: number };

const shift = (date: string, days: number) => {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const bucketOf = (date: string, group: Group) => {
  if (group === "month") return `${date.slice(0, 7)}-01`;
  if (group === "week") return shift(date, -((new Date(date).getUTCDay() + 6) % 7));
  return date;
};

const nextBucket = (start: string, group: Group) => {
  if (group !== "month") return shift(start, group === "week" ? 7 : 1);
  const d = new Date(start);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
};

const byTotal = (a: Total, b: Total) => b.total - a.total;

type Range = z.infer<typeof range>;

const scope = (db: Ctx["db"], { from, to, tag }: Range) =>
  and(countable, between(schema.transactions.date, from, to), tag ? taggedWith(db, tag) : undefined);

const entries = (db: Ctx["db"], q: Range) =>
  db
    .select({
      id: schema.transactions.id,
      amount: schema.transactions.amount,
      currency: schema.transactions.currency,
      date: schema.transactions.date,
      categoryId: schema.transactions.categoryId,
      kind: kindOf,
    })
    .from(schema.transactions)
    .where(scope(db, q))
    .all();

const sum = (rs: { baseAmount: number }[]) => rs.reduce((s, r) => s + r.baseAmount, 0);

export async function period({ db, value }: Pick<Ctx, "db" | "value">, q: Range) {
  const { from, to, group } = q;
  const valued = await value(entries(db, q));
  const rated = valued.filter((r): r is (typeof valued)[number] & { baseAmount: number } => r.baseAmount !== null);
  const counted = rated.filter((r) => r.kind === "expense");
  const earned = rated.filter((r) => r.kind === "income");

  const all: Category[] = db
    .select({
      id: schema.categories.id,
      name: schema.categories.name,
      icon: schema.categories.icon,
      color: schema.categories.color,
      parentId: schema.categories.parentId,
      kind: schema.categories.kind,
    })
    .from(schema.categories)
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
    .select({ id: schema.transactionTags.transactionId, name: schema.tags.name })
    .from(schema.transactionTags)
    .innerJoin(schema.tags, eq(schema.tags.id, schema.transactionTags.tagId))
    .innerJoin(schema.transactions, eq(schema.transactions.id, schema.transactionTags.transactionId))
    .where(scope(db, q))
    .all()) {
    const amount = amounts.get(id);
    if (amount !== undefined) tagged.set(name, (tagged.get(name) ?? 0) + amount);
  }
  const tags = [...tagged].map(([name, total]) => ({ name, total })).sort(byTotal);

  const currencies = new Map<string, { currency: string; amount: number; base: number | null }>();
  for (const r of valued.filter((r) => r.kind === "expense")) {
    const c = currencies.get(r.currency) ?? { currency: r.currency, amount: 0, base: 0 };
    c.amount += r.amount;
    c.base = c.base === null || r.baseAmount === null ? null : c.base + r.baseAmount;
    currencies.set(r.currency, c);
  }

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
    currencies: [...currencies.values()].sort((a, b) => (b.base ?? -1) - (a.base ?? -1)),
    buckets: [...buckets].map(([start, total]) => ({ start, total })),
    income: { total: sum(earned), categories: breakdown("income", earned) },
  };
}

async function sats({ db, value, clock }: Pick<Ctx, "db" | "value" | "clock">, q: Range) {
  const { baseCurrency, sats } = settings(db);
  if (!sats || baseCurrency === "BTC") return null;
  const valued = await value(entries(db, q), "BTC");
  const rated = valued.filter((r): r is (typeof valued)[number] & { baseAmount: number } => r.baseAmount !== null);
  const total = sum(rated.filter((r) => r.kind === "expense"));
  const income = sum(rated.filter((r) => r.kind === "income"));
  const date = today(clock);
  const [spent, earned] = await value([
    { amount: total, currency: "BTC", date },
    { amount: income, currency: "BTC", date },
  ]);
  return {
    total,
    income,
    unconverted: valued.length - rated.length,
    today:
      spent.baseAmount === null || earned.baseAmount === null
        ? null
        : { total: spent.baseAmount, income: earned.baseAmount },
  };
}

export const stats = async (ctx: Pick<Ctx, "db" | "value" | "clock">, q: Range) => ({
  ...(await period(ctx, q)),
  sats: await sats(ctx, q),
});
