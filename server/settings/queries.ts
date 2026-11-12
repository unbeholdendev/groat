import { and, desc, eq, inArray, isNull, max } from "drizzle-orm";
import { type Db, seeded } from "../db";
import * as schema from "../schema";
import { visible } from "../transactions/queries";

export function settings(db: Db) {
  const { baseCurrency, theme, onboarded } = seeded(db.select().from(schema.settings).get());
  const last = db
    .select({ currency: schema.transactions.currency })
    .from(schema.transactions)
    .where(and(visible, isNull(schema.transactions.recurringId)))
    .orderBy(desc(schema.transactions.id))
    .get();
  const used = db
    .select({ currency: schema.transactions.currency })
    .from(schema.transactions)
    .where(visible)
    .groupBy(schema.transactions.currency)
    .orderBy(desc(max(schema.transactions.id)))
    .all();
  const earning = db
    .select({ id: schema.categories.id })
    .from(schema.categories)
    .where(eq(schema.categories.kind, "income"));
  const income = !!db
    .select({ id: schema.transactions.id })
    .from(schema.transactions)
    .where(and(visible, inArray(schema.transactions.categoryId, earning)))
    .get();
  return {
    baseCurrency,
    recentCurrencies: [...new Set([...used.map((u) => u.currency), baseCurrency])],
    lastCurrency: last?.currency ?? baseCurrency,
    theme,
    onboarded,
    income,
  };
}
