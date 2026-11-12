import { and, eq, type SQL } from "drizzle-orm";
import type { Kind } from "../../shared/schema";
import { type Db, seeded } from "../db";
import * as schema from "../schema";

export const shape = {
  id: schema.categories.id,
  name: schema.categories.name,
  icon: schema.categories.icon,
  color: schema.categories.color,
  parentId: schema.categories.parentId,
  builtin: schema.categories.builtin,
  kind: schema.categories.kind,
};
export const categories = (db: Db, where?: SQL) => db.select(shape).from(schema.categories).where(where);

export const builtin = (db: Db, kind: Kind) =>
  seeded(
    db
      .select({ id: schema.categories.id })
      .from(schema.categories)
      .where(and(eq(schema.categories.builtin, true), eq(schema.categories.kind, kind)))
      .get(),
  ).id;
