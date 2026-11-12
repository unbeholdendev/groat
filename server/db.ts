import type { Database } from "bun:sqlite";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";

export type Db = BunSQLiteDatabase & { $client: Database };

export const migrationsFolder = `${import.meta.dir}/drizzle`;

export const seeded = <T>(row: T | undefined) => {
  if (!row) throw new Error("database is missing its seeded rows");
  return row;
};
