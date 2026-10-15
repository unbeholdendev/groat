import { decimals } from "../shared/amount";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { isoDate } from "../shared/schema";
import type { Ctx, Deps } from "./app";
import { type Db, settings, today } from "./db";
import { body } from "./request";
import * as t from "./schema";

type Row = { amount: number; currency: string; date: string };
type Source = (fetch: Deps["fetch"], date: string, currencies: string[]) => Promise<Record<string, number>>;

const quotes = z.array(z.object({ quote: z.string(), rate: z.number() }));
const prices = z.object({ prices: z.array(z.object({ USD: z.number() })) });

const frankfurter: Source = async (fetch, date, currencies) => {
  const fiat = currencies.filter((c) => c !== "BTC");
  if (!fiat.length) return {};
  const res = await fetch(`https://api.frankfurter.dev/v2/rates?date=${date}&base=USD&quotes=${fiat}&providers=ECB`);
  return Object.fromEntries(quotes.parse(await res.json()).map((r) => [r.quote, r.rate]));
};

const mempool: Source = async (fetch, date, currencies) => {
  if (!currencies.includes("BTC")) return {};
  const timestamp = Date.parse(`${date}T23:59:59Z`) / 1000;
  const res = await fetch(`https://mempool.space/api/v1/historical-price?currency=USD&timestamp=${timestamp}`);
  const usd = prices.parse(await res.json()).prices[0]?.USD ?? 0;
  const rates: Record<string, number> = {};
  if (usd > 0) rates.BTC = 1 / usd;
  return rates;
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
      const from = rates.get(r.date)?.get(r.currency);
      const to = rates.get(r.date)?.get(base);
      if (!from || !to) return { ...r, baseAmount: null };
      return { ...r, baseAmount: Math.round((r.amount * to * 10 ** decimals(base)) / (from * 10 ** decimals(r.currency))) };
    });
  };
}

export const knownCurrencies = new Set([...Intl.supportedValuesOf("currency"), "BTC"]);

const manualRate = z.object({
  date: isoDate,
  currency: z.string().refine((c) => knownCurrencies.has(c)),
  rate: z
    .string()
    .regex(/^\d+(\.\d+)?$/)
    .transform(Number)
    .refine((n) => n > 0),
});

export function rateRoutes(db: Db) {
  const app = new Hono();

  app.put("/api/rates", async (c) => {
    const input = await body(c, manualRate);
    if ("error" in input) return c.json({ error: "invalid rate" }, 400);
    const { date, currency, rate } = input.data;
    const row = { rate, source: "manual" };
    db.insert(t.rates).values({ date, currency, ...row }).onConflictDoUpdate({ target: [t.rates.date, t.rates.currency], set: row }).run();
    return c.json({ date, currency, rate });
  });

  return app;
}
