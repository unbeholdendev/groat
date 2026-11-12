import { and, eq, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { kind } from "../../shared/schema";
import type { Env } from "../auth/access";
import type { Ctx } from "../context";
import { body, query } from "../request";
import * as schema from "../schema";
import { builtin, categories, shape } from "./queries";

const required = "Enter a name, emoji and colour";
const text = (message: string) => z.string(message).trim().min(1, message);
const categoryInput = z.object({ name: text(required), icon: text(required), color: text(required) });
export const newCategory = categoryInput.extend({
  parentId: z.number("Invalid parent category").int("Invalid parent category").nullable().default(null),
  kind: kind.optional(),
});
export const categoryUpdate = categoryInput.extend({ kind }).partial();
export const order = z.array(
  z.number("Expected a list of category IDs").int("Expected a list of category IDs"),
  "Expected a list of category IDs",
);
const deletion = z.object({
  moveTo: z.coerce.number("Invalid category to move to").int("Invalid category to move to").optional(),
});

export function categoryRoutes({ db }: Pick<Ctx, "db">) {
  const app = new Hono<Env>();

  app.get("/api/categories", (c) => {
    const mine = and(
      eq(schema.categoryOrder.categoryId, schema.categories.id),
      eq(schema.categoryOrder.userId, c.get("user").id),
    );
    return c.json(
      db
        .select(shape)
        .from(schema.categories)
        .leftJoin(schema.categoryOrder, mine)
        .orderBy(
          isNotNull(schema.categories.parentId),
          schema.categories.kind,
          isNull(schema.categoryOrder.sort),
          schema.categoryOrder.sort,
          schema.categories.sort,
        )
        .all(),
    );
  });

  app.post("/api/categories", async (c) => {
    const input = await body(c, newCategory);
    if ("error" in input) return c.json(input, 400);
    const { parentId } = input.data;
    const parent =
      parentId === null
        ? undefined
        : db
            .select()
            .from(schema.categories)
            .where(and(eq(schema.categories.id, parentId), isNull(schema.categories.parentId)))
            .get();
    if (parentId !== null && !parent) return c.json({ error: "Invalid parent category" }, 400);
    if (parent && input.data.kind && input.data.kind !== parent.kind)
      return c.json({ error: "A subcategory has its parent’s kind" }, 400);
    const sort = sql`(SELECT coalesce(max(sort), -1) + 1 FROM categories WHERE parent_id IS ${parentId})`;
    const { id } = db
      .insert(schema.categories)
      .values({ ...input.data, kind: parent?.kind ?? input.data.kind, sort })
      .returning({ id: schema.categories.id })
      .get();
    return c.json(categories(db, eq(schema.categories.id, id)).get(), 201);
  });

  app.put("/api/categories/order", async (c) => {
    const ids = await body(c, order);
    if ("error" in ids) return c.json(ids, 400);
    const userId = c.get("user").id;
    const known = categories(db, inArray(schema.categories.id, ids.data))
      .all()
      .map((k) => k.id);
    db.transaction(() =>
      ids.data
        .filter((id) => known.includes(id))
        .forEach((categoryId, sort) => {
          db.insert(schema.categoryOrder)
            .values({ userId, categoryId, sort })
            .onConflictDoUpdate({
              target: [schema.categoryOrder.userId, schema.categoryOrder.categoryId],
              set: { sort },
            })
            .run();
        }),
    );
    return c.json({});
  });

  app.put("/api/categories/:id", async (c) => {
    const id = Number(c.req.param("id"));
    const input = await body(c, categoryUpdate);
    if ("error" in input) return c.json(input, 400);
    const old = categories(db, eq(schema.categories.id, id)).get();
    if (!old) return c.json({ error: "Not found" }, 404);
    const { kind = old.kind, ...fields } = input.data;
    if (kind !== old.kind && old.parentId !== null)
      return c.json({ error: "Only top-level categories can change kind" }, 400);
    if (kind !== old.kind && old.builtin) return c.json({ error: `${old.name} can’t change kind` }, 400);
    db.transaction(() => {
      db.update(schema.categories)
        .set({ ...fields, kind })
        .where(eq(schema.categories.id, id))
        .run();
      db.update(schema.categories).set({ kind }).where(eq(schema.categories.parentId, id)).run();
    });
    return c.json(categories(db, eq(schema.categories.id, id)).get());
  });

  app.delete("/api/categories/:id", (c) => {
    const id = Number(c.req.param("id"));
    const old = categories(db, eq(schema.categories.id, id)).get();
    if (!old) return c.json({ error: "Not found" }, 404);
    if (old.builtin) return c.json({ error: `${old.name} can’t be deleted` }, 400);
    const q = query(c, deletion);
    if ("error" in q) return c.json(q, 400);
    const target = q.data.moveTo ?? builtin(db, old.kind);
    if (
      !db
        .select()
        .from(schema.categories)
        .where(
          and(
            eq(schema.categories.id, target),
            eq(schema.categories.kind, old.kind),
            ne(schema.categories.id, id),
            sql`${schema.categories.parentId} IS NOT ${id}`,
          ),
        )
        .get()
    )
      return c.json({ error: "Invalid category to move to" }, 400);
    const family = or(eq(schema.categories.id, id), eq(schema.categories.parentId, id));
    const members = db.select({ id: schema.categories.id }).from(schema.categories).where(family);
    db.transaction(() => {
      db.update(schema.transactions)
        .set({ categoryId: target })
        .where(inArray(schema.transactions.categoryId, members))
        .run();
      db.update(schema.recurring)
        .set({ categoryId: target })
        .where(inArray(schema.recurring.categoryId, members))
        .run();
      db.delete(schema.categories).where(family).run();
    });
    return c.json({});
  });

  return app;
}
