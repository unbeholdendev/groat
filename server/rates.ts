import { decimals } from "../shared/amount";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Ctx, Deps } from "./app";
import { type Db, isDate, settings, today } from "./db";
import { json } from "./request";
import * as t from "./schema";

type Row = { amount: number; currency: string; date: string };
type Source = (fetch: Deps["fetch"], date: string, currencies: string[]) => Promise<Record<string, number>>;

const frankfurter: Source = async (fetch, date, currencies) => {
  const fiat = currencies.filter((c) => c !== "BTC");
  if (!fiat.length) return {};
  const res = await fetch(`https://api.frankfurter.dev/v2/rates?date=${date}&base=USD&quotes=${fiat}&providers=ECB`);
  const body = (await res.json()) as { quote: string; rate: number }[];
  return Object.fromEntries(body.map((r) => [r.quote, r.rate]));
};

const mempool: Source = async (fetch, date, currencies) => {
  if (!currencies.includes("BTC")) return {};
  const timestamp = Date.parse(`${date}T23:59:59Z`) / 1000;
  const res = await fetch(`https://mempool.space/api/v1/historical-price?currency=USD&timestamp=${timestamp}`);
  const { prices } = (await res.json()) as { prices: { USD: number }[] };
  const usd = prices[0]?.USD ?? 0;
  return usd > 0 ? { BTC: 1 / usd } : ({} as Record<string, number>);
};

const sources = { frankfurter, mempool };

export type Valuer = ReturnType<typeof valuer>;

export function valuer({ db, fetch, clock }: Pick<Ctx, "db" | "fetch" | "clock">) {
  const failed = new Set<string>();

  return async <T extends Row>(rows: T[]) => {
    const { baseCurrency: base, currencies } = settings(db);
    const now = today(clock);
    const rates = new Map<string, Map<string, number>>();

    await Promise.all(
      [...new Set(rows.filter((r) => r.currency !== base).map((r) => r.date))].map(async (date) => {
        const have = new Map(
          db
            .select({ currency: t.rates.currency, rate: t.rates.rate })
            .from(t.rates)
            .where(eq(t.rates.date, date))
            .all()
            .map((r) => [r.currency, r.rate]),
        ).set("USD", 1);
        rates.set(date, have);
        const needed = rows.filter((r) => r.date === date).map((r) => r.currency).concat(base);
        if (needed.every((c) => have.has(c) || failed.has(`${date} ${c}`))) return;
        const missing = [...new Set([...needed, ...currencies])].filter((c) => !have.has(c));
        for (const [name, source] of Object.entries(sources)) {
          const got = await source(fetch, date, missing).catch(() => ({}));
          for (const [currency, rate] of Object.entries(got)) {
            have.set(currency, rate);
            if (date < now) db.insert(t.rates).values({ date, currency, rate, source: name }).onConflictDoNothing().run();
          }
        }
        if (date < now) for (const c of missing) if (!have.has(c)) failed.add(`${date} ${c}`);
      }),
    );

    return rows.map((r) => {
      if (r.currency === base) return { ...r, baseAmount: r.amount };
      const have = rates.get(r.date)!;
      const from = have.get(r.currency);
      const to = have.get(base);
      if (!from || !to) return { ...r, baseAmount: null };
      return { ...r, baseAmount: Math.round((r.amount * to * 10 ** decimals(base)) / (from * 10 ** decimals(r.currency))) };
    });
  };
}

export const knownCurrencies = new Set([...Intl.supportedValuesOf("currency"), "BTC"]);

export function rateRoutes(db: Db) {
  const app = new Hono();

  app.put("/api/rates", async (c) => {
    const { date, currency, rate } = await json(c);
    if (!isDate(date) || !knownCurrencies.has(currency) || typeof rate !== "string" || !/^\d+(\.\d+)?$/.test(rate) || !Number(rate))
      return c.json({ error: "invalid rate" }, 400);
    const row = { rate: Number(rate), source: "manual" };
    db.insert(t.rates).values({ date, currency, ...row }).onConflictDoUpdate({ target: [t.rates.date, t.rates.currency], set: row }).run();
    return c.json({ date, currency, rate: Number(rate) });
  });

  return app;
}
