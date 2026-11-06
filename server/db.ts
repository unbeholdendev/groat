import { and, desc, eq, inArray, isNull, max, sql } from "drizzle-orm";
import type { Database } from "bun:sqlite";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import type { Kind } from "../shared/schema";
import * as t from "./schema";

export type Db = BunSQLiteDatabase & { $client: Database };

export const migrationsFolder = `${import.meta.dir}/drizzle`;

export const visible = isNull(t.transactions.deletedAt);
export const countable = and(visible, eq(t.transactions.status, "normal"));
export const kindOf = sql<Kind>`coalesce((SELECT kind FROM categories WHERE categories.id = ${t.transactions.categoryId}), 'expense')`;

export const today = (clock: () => Date) => clock().toISOString().slice(0, 10);

const seeded = <T>(row: T | undefined) => {
  if (!row) throw new Error("database is missing its seeded rows");
  return row;
};

export const builtin = (db: Db, kind: Kind) =>
  seeded(db.select({ id: t.categories.id }).from(t.categories).where(and(eq(t.categories.builtin, true), eq(t.categories.kind, kind))).get()).id;

export const uncategorised = (db: Db) => builtin(db, "expense");
export function settings(db: Db) {
  const { baseCurrency, theme, onboarded } = seeded(db.select().from(t.settings).get());
  const last = db
    .select({ currency: t.transactions.currency })
    .from(t.transactions)
    .where(and(visible, isNull(t.transactions.recurringId)))
    .orderBy(desc(t.transactions.id))
    .get();
  const used = db
    .select({ currency: t.transactions.currency })
    .from(t.transactions)
    .where(visible)
    .groupBy(t.transactions.currency)
    .orderBy(desc(max(t.transactions.id)))
    .all();
  const earning = db.select({ id: t.categories.id }).from(t.categories).where(eq(t.categories.kind, "income"));
  const income = !!db.select({ id: t.transactions.id }).from(t.transactions).where(and(visible, inArray(t.transactions.categoryId, earning))).get();
  return {
    baseCurrency,
    recentCurrencies: [...new Set([...used.map((u) => u.currency), baseCurrency])],
    lastCurrency: last?.currency ?? baseCurrency,
    theme,
    onboarded,
    income,
  };
}
