import { decimals, knownCurrencies } from "../shared/amount";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { isoDate } from "../shared/schema";
import { json, valid, query } from "./request";
import { z } from "zod";
import type { Ctx, Deps } from "./app";
import { settings, today } from "./db";
import * as t from "./schema";

type Row = { amount: number; currency: string; date: string };
type Source = (fetch: Deps["fetch"], date: string, currencies: string[]) => Promise<Record<string, { rate: number; date: string | null }>>;

const quotes = z.array(z.object({ quote: z.string(), rate: z.number(), date: isoDate.optional() }));
const prices = z.object({ prices: z.array(z.object({ USD: z.number(), time: z.number().optional() })) });
const spot = z.object({ data: z.object({ amount: z.coerce.number() }) });

const frankfurter: Source = async (fetch, date, currencies) => {
  const fiat = currencies.filter((c) => c !== "BTC");
  if (!fiat.length) return {};
  const res = await fetch(`https://api.frankfurter.dev/v2/rates?date=${date}&base=USD&quotes=${fiat}`, { signal: AbortSignal.timeout(3000) });
  return Object.fromEntries(quotes.parse(await res.json()).map((r) => [r.quote, { rate: r.rate, date: r.date ?? null }]));
};

const mempool: Source = async (fetch, date, currencies) => {
  if (!currencies.includes("BTC")) return {};
  const timestamp = Date.parse(`${date}T23:59:59Z`) / 1000;
  const res = await fetch(`https://mempool.space/api/v1/historical-price?currency=USD&timestamp=${timestamp}`, { signal: AbortSignal.timeout(3000) });
  const price = prices.parse(await res.json()).prices[0];
  const usd = price?.USD ?? 0;
  const rates: Record<string, { rate: number; date: string | null }> = {};
  if (usd > 0) rates.BTC = { rate: 1 / usd, date: price?.time ? new Date(price.time * 1000).toISOString().slice(0, 10) : null };
  return rates;
};

const coinbase: Source = async (fetch, date, currencies) => {
  if (!currencies.includes("BTC")) return {};
  const res = await fetch(`https://api.coinbase.com/v2/prices/BTC-USD/spot?date=${date}`, { signal: AbortSignal.timeout(3000) });
  const usd = spot.parse(await res.json()).data.amount;
  return Object.fromEntries(usd > 0 ? [["BTC", { rate: 1 / usd, date }]] : []);
};

const sources = { frankfurter, mempool, coinbase };

export type Valuer = ReturnType<typeof valuer>;

export function valuer({ db, fetch, clock }: Pick<Ctx, "db" | "fetch" | "clock">) {
  const recent = new Map<string, { at: number; rate?: number }>();

  const provenance = new Map<string, { source: string; rateDate: string | null }>();
  const value = async <T extends Row>(rows: T[]) => {
    const { baseCurrency: base } = settings(db);
    const now = today(clock);
    const rates = new Map<string, Map<string, number>>();

    await Promise.all(
      [...new Set(rows.filter((r) => r.currency !== base).map((r) => r.date))].map(async (date) => {
        const have = new Map(
          db
            .select({ currency: t.rates.currency, rate: t.rates.rate, source: t.rates.source, rateDate: t.rates.rateDate })
            .from(t.rates)
            .where(eq(t.rates.date, date))
            .all()
            .map((r) => { provenance.set(`${date} ${r.currency}`, { source: r.source, rateDate: r.rateDate }); return [r.currency, r.rate] as const; }),
        ).set("USD", 1);
        rates.set(date, have);
        const needed = rows.filter((r) => r.date === date).map((r) => r.currency).concat(base);
        const fresh = (c: string) => {
          const hit = recent.get(`${date} ${c}`);
          return hit && clock().getTime() - hit.at < 600_000 ? hit : undefined;
        };
        for (const c of needed) {
          const rate = fresh(c)?.rate;
          if (rate && !have.has(c)) have.set(c, rate);
        }
        if (needed.every((c) => have.has(c) || fresh(c))) return;
        const missing = [...new Set(needed)].filter((c) => !have.has(c) && !fresh(c));
        for (const [name, source] of Object.entries(sources)) {
          const got = await source(fetch, date, missing.filter((c) => !have.has(c))).catch(() => ({}));
          for (const [currency, quote] of Object.entries(got)) {
            const { rate } = quote;
            if (!Number.isFinite(rate) || rate <= 0) continue;
            provenance.set(`${date} ${currency}`, { source: name, rateDate: quote.date });
            have.set(currency, rate);
            if (date < now) db.insert(t.rates).values({ date, currency, rate, source: name, rateDate: quote.date }).onConflictDoNothing().run();
          }
        }
        for (const c of missing) recent.set(`${date} ${c}`, { at: clock().getTime(), rate: have.get(c) });
      }),
    );

    return rows.map((r) => {
      if (r.currency === base) return { ...r, baseAmount: r.amount, conversion: null };
      const quote = (currency: string, rate: number | undefined) => rate ? { currency, rate, ...(currency === "USD" ? { source: "identity", rateDate: r.date } : provenance.get(`${r.date} ${currency}`) ?? { source: "unknown", rateDate: null }) } : null;
      const from = rates.get(r.date)?.get(r.currency);
      const to = rates.get(r.date)?.get(base);
      const conversion = { date: r.date, from: quote(r.currency, from), to: quote(base, to) };
      if (!from || !to) return { ...r, baseAmount: null, conversion };
      const numerator = r.amount * to * 10 ** decimals(base);
      const denominator = from * 10 ** decimals(r.currency);
      if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return { ...r, baseAmount: null, conversion };
      const amount = Math.round(numerator / denominator);
      return { ...r, baseAmount: Number.isSafeInteger(amount) ? amount : null, conversion };
    });
  };
  return Object.assign(value, { reset: () => { recent.clear(); provenance.clear(); } });
}

export function rateRoutes({ db }: Ctx, value: Valuer) {
  const app = new Hono();
  const key = z.object({ date: isoDate, currency: z.string().refine(c => c !== "USD" && knownCurrencies.has(c)) });
  app.get("/api/rates", c => c.json(db.select().from(t.rates).where(eq(t.rates.source, "manual")).all()));
  app.put("/api/rates", async c => {
    const body = valid(key.extend({ rate: z.number().finite().positive() }), await json(c));
    if ("error" in body) return c.json({ error: "Enter a date, currency and positive rate" }, 400);
    const { date, currency, rate } = body.data;
    db.insert(t.rates).values({ date, currency, rate, source: "manual", rateDate: date })
      .onConflictDoUpdate({ target: [t.rates.date, t.rates.currency], set: { rate, source: "manual", rateDate: date } }).run();
    value.reset();
    return c.json({});
  });
  app.delete("/api/rates", c => {
    const body = query(c, key);
    if ("error" in body) return c.json({ error: "Invalid rate" }, 400);
    db.delete(t.rates).where(and(eq(t.rates.date, body.data.date), eq(t.rates.currency, body.data.currency), eq(t.rates.source, "manual"))).run();
    value.reset();
    return c.json({});
  });
  return app;
}
