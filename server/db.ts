import { and, desc, eq, isNull } from "drizzle-orm";
import type { Database } from "bun:sqlite";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import * as t from "./schema";

export type Db = BunSQLiteDatabase & { $client: Database };

export const visible = isNull(t.expenses.deletedAt);
export const countable = and(visible, eq(t.expenses.status, "normal"));

export const today = (clock: () => Date) => clock().toISOString().slice(0, 10);

export const isDate = (s: unknown) =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(Date.parse(s) || 0).toISOString().slice(0, 10) === s;

export const uncategorised = (db: Db) =>
  db.select({ id: t.categories.id }).from(t.categories).where(eq(t.categories.builtin, true)).get()!.id;

export function settings(db: Db) {
  const { baseCurrency, currencies, theme, onboarded } = db.select().from(t.settings).get()!;
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
