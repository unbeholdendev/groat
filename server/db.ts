import { and, desc, eq, isNull } from "drizzle-orm";
import type { Database } from "bun:sqlite";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import * as t from "./schema";

export type Db = BunSQLiteDatabase & { $client: Database };

export const visible = isNull(t.expenses.deletedAt);
export const countable = and(visible, eq(t.expenses.status, "normal"));

export const today = (clock: () => Date) => clock().toISOString().slice(0, 10);

const seeded = <T>(row: T | undefined) => {
  if (!row) throw new Error("database is missing its seeded rows");
  return row;
};

export const uncategorised = (db: Db) =>
  seeded(db.select({ id: t.categories.id }).from(t.categories).where(eq(t.categories.builtin, true)).get()).id;

export function settings(db: Db) {
  const { baseCurrency, currencies, theme, onboarded } = seeded(db.select().from(t.settings).get());
  const last = db
    .select({ currency: t.expenses.currency })
    .from(t.expenses)
    .where(and(visible, isNull(t.expenses.recurringId)))
    .orderBy(desc(t.expenses.id))
    .get();
  return {
    baseCurrency,
    currencies,
    lastCurrency: last && currencies.includes(last.currency) ? last.currency : baseCurrency,
    theme,
    onboarded,
  };
}
