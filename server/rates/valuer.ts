import { eq } from "drizzle-orm";
import { decimals } from "../../shared/amount";
import { type Ctx, today } from "../context";
import { errorKind, log } from "../logging";
import * as schema from "../schema";
import { settings } from "../settings/queries";
import { sources } from "./sources";

type Row = { amount: number; currency: string; date: string };

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
            .select({
              currency: schema.rates.currency,
              rate: schema.rates.rate,
              source: schema.rates.source,
              rateDate: schema.rates.rateDate,
            })
            .from(schema.rates)
            .where(eq(schema.rates.date, date))
            .all()
            .map((r) => {
              provenance.set(`${date} ${r.currency}`, { source: r.source, rateDate: r.rateDate });
              return [r.currency, r.rate] as const;
            }),
        ).set("USD", 1);
        rates.set(date, have);
        const needed = rows
          .filter((r) => r.date === date)
          .map((r) => r.currency)
          .concat(base);
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
          const got = await source(
            fetch,
            date,
            missing.filter((c) => !have.has(c)),
          ).catch((error) => {
            log("warn", "rates.source.failed", { service: name, error: errorKind(error) });
            return {};
          });
          for (const [currency, quote] of Object.entries(got)) {
            const { rate } = quote;
            if (!Number.isFinite(rate) || rate <= 0) continue;
            provenance.set(`${date} ${currency}`, { source: name, rateDate: quote.date });
            have.set(currency, rate);
            if (date < now)
              db.insert(schema.rates)
                .values({ date, currency, rate, source: name, rateDate: quote.date })
                .onConflictDoNothing()
                .run();
          }
        }
        for (const c of missing) recent.set(`${date} ${c}`, { at: clock().getTime(), rate: have.get(c) });
      }),
    );

    return rows.map((r) => {
      if (r.currency === base) return { ...r, baseAmount: r.amount, conversion: null };
      const quote = (currency: string, rate: number | undefined) =>
        rate
          ? {
              currency,
              rate,
              ...(currency === "USD"
                ? { source: "identity", rateDate: r.date }
                : (provenance.get(`${r.date} ${currency}`) ?? { source: "unknown", rateDate: null })),
            }
          : null;
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
  return value;
}
