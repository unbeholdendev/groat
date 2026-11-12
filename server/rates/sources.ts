import { z } from "zod";
import { isoDate } from "../../shared/schema";
import type { Deps } from "../context";

type Source = (
  fetch: Deps["fetch"],
  date: string,
  currencies: string[],
) => Promise<Record<string, { rate: number; date: string | null }>>;

const quotes = z.array(z.object({ quote: z.string(), rate: z.number(), date: isoDate.optional() }));
const prices = z.object({ prices: z.array(z.object({ USD: z.number(), time: z.number().optional() })) });
const spot = z.object({ data: z.object({ amount: z.coerce.number() }) });

const frankfurter: Source = async (fetch, date, currencies) => {
  const fiat = currencies.filter((c) => c !== "BTC");
  if (!fiat.length) return {};
  const res = await fetch(`https://api.frankfurter.dev/v2/rates?date=${date}&base=USD&quotes=${fiat}`, {
    signal: AbortSignal.timeout(3000),
  });
  return Object.fromEntries(
    quotes.parse(await res.json()).map((r) => [r.quote, { rate: r.rate, date: r.date ?? null }]),
  );
};

const mempool: Source = async (fetch, date, currencies) => {
  if (!currencies.includes("BTC")) return {};
  const timestamp = Date.parse(`${date}T23:59:59Z`) / 1000;
  const res = await fetch(`https://mempool.space/api/v1/historical-price?currency=USD&timestamp=${timestamp}`, {
    signal: AbortSignal.timeout(3000),
  });
  const price = prices.parse(await res.json()).prices[0];
  const usd = price?.USD ?? 0;
  const rates: Record<string, { rate: number; date: string | null }> = {};
  if (usd > 0)
    rates.BTC = { rate: 1 / usd, date: price?.time ? new Date(price.time * 1000).toISOString().slice(0, 10) : null };
  return rates;
};

const coinbase: Source = async (fetch, date, currencies) => {
  if (!currencies.includes("BTC")) return {};
  const res = await fetch(`https://api.coinbase.com/v2/prices/BTC-USD/spot?date=${date}`, {
    signal: AbortSignal.timeout(3000),
  });
  const usd = spot.parse(await res.json()).data.amount;
  return Object.fromEntries(usd > 0 ? [["BTC", { rate: 1 / usd, date }]] : []);
};

export const sources = { frankfurter, mempool, coinbase };
