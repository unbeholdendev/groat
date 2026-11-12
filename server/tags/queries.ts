import { eq, sql } from "drizzle-orm";
import type { Db } from "../db";
import * as schema from "../schema";

export const retag = (db: Db, id: number, name: string | null) =>
  db.transaction(() => {
    const old = db.select().from(schema.tags).where(eq(schema.tags.id, id)).get();
    if (!old) return null;
    db.update(schema.recurring)
      .set({
        tags: sql`(SELECT json_group_array(CASE WHEN value = ${old.name} THEN ${name} ELSE value END)
          FROM json_each(recurring.tags) WHERE ${name} IS NOT NULL OR value != ${old.name})`,
      })
      .run();
    if (name === null) db.delete(schema.tags).where(eq(schema.tags.id, id)).run();
    else db.update(schema.tags).set({ name }).where(eq(schema.tags.id, id)).run();
    return old;
  });
