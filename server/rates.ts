import { decimals } from "../shared/amount";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Ctx, Deps } from "./app";
import { settings, today } from "./db";
import * as t from "./schema";

type Row = { amount: number; currency: string; date: string };
type Source = (fetch: Deps["fetch"], date: string, currencies: string[]) => Promise<Record<string, number>>;

const quotes = z.array(z.object({ quote: z.string(), rate: z.number() }));
const prices = z.object({ prices: z.array(z.object({ USD: z.number() })) });
const spot = z.object({ data: z.object({ amount: z.coerce.number() }) });

const frankfurter: Source = async (fetch, date, currencies) => {
  const fiat = currencies.filter((c) => c !== "BTC");
  if (!fiat.length) return {};
  const res = await fetch(`https://api.frankfurter.dev/v2/rates?date=${date}&base=USD&quotes=${fiat}`, { signal: AbortSignal.timeout(3000) });
  return Object.fromEntries(quotes.parse(await res.json()).map((r) => [r.quote, r.rate]));
};

const mempool: Source = async (fetch, date, currencies) => {
  if (!currencies.includes("BTC")) return {};
  const timestamp = Date.parse(`${date}T23:59:59Z`) / 1000;
  const res = await fetch(`https://mempool.space/api/v1/historical-price?currency=USD&timestamp=${timestamp}`, { signal: AbortSignal.timeout(3000) });
  const usd = prices.parse(await res.json()).prices[0]?.USD ?? 0;
  const rates: Record<string, number> = {};
  if (usd > 0) rates.BTC = 1 / usd;
  return rates;
};

const coinbase: Source = async (fetch, date, currencies) => {
  if (!currencies.includes("BTC")) return {};
  const res = await fetch(`https://api.coinbase.com/v2/prices/BTC-USD/spot?date=${date}`, { signal: AbortSignal.timeout(3000) });
  const usd = spot.parse(await res.json()).data.amount;
  return Object.fromEntries(usd > 0 ? [["BTC", 1 / usd]] : []);
};

const sources = { frankfurter, mempool, coinbase };

export type Valuer = ReturnType<typeof valuer>;

export function valuer({ db, fetch, clock }: Pick<Ctx, "db" | "fetch" | "clock">) {
  const failed = new Set<string>();
  const recent = new Map<string, { at: number; rate?: number }>();

  return async <T extends Row>(rows: T[]) => {
    const { baseCurrency: base } = settings(db);
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
        const fresh = (c: string) => {
          const hit = recent.get(`${date} ${c}`);
          return hit && clock().getTime() - hit.at < 600_000 ? hit : undefined;
        };
        for (const c of needed) {
          const rate = fresh(c)?.rate;
          if (rate) have.set(c, rate);
        }
        if (needed.every((c) => have.has(c) || failed.has(`${date} ${c}`) || fresh(c))) return;
        const missing = [...new Set(needed)].filter((c) => !have.has(c) && !fresh(c));
        for (const [name, source] of Object.entries(sources)) {
          const got = await source(fetch, date, missing.filter((c) => !have.has(c))).catch(() => ({}));
          for (const [currency, rate] of Object.entries(got)) {
            have.set(currency, rate);
            if (date < now) db.insert(t.rates).values({ date, currency, rate, source: name }).onConflictDoNothing().run();
          }
        }
        if (date < now) for (const c of missing) if (!have.has(c)) failed.add(`${date} ${c}`);
        if (date >= now) for (const c of missing) recent.set(`${date} ${c}`, { at: clock().getTime(), rate: have.get(c) });
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
