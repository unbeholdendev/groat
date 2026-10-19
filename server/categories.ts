import { and, eq, inArray, isNotNull, isNull, ne, or, type SQL, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "./auth";
import { type Db, uncategorised } from "./db";
import { body, query } from "./request";
import * as t from "./schema";

const cat = t.categories;
const e = t.expenses;
const r = t.recurring;
const o = t.categoryOrder;

const required = "Enter a name, emoji and colour";
const text = (message: string) => z.string(message).trim().min(1, message);
const categoryInput = z.object({ name: text(required), icon: text(required), color: text(required) });
const newCategory = categoryInput.extend({ parentId: z.number("Invalid parent category").int("Invalid parent category").nullable().default(null) });
const order = z.array(z.number("Expected a list of category IDs").int("Expected a list of category IDs"), "Expected a list of category IDs");
const tagInput = z.object({ name: text("Enter a name") });
const deletion = z.object({ moveTo: z.coerce.number("Invalid category to move to").int("Invalid category to move to").optional() });

const shape = { id: cat.id, name: cat.name, icon: cat.icon, color: cat.color, parentId: cat.parentId, builtin: cat.builtin };
export const categories = (db: Db, where?: SQL) => db.select(shape).from(cat).where(where);

export function categoryRoutes(db: Db) {
  const app = new Hono<Env>();

  app.get("/api/categories", (c) => {
    const mine = and(eq(o.categoryId, cat.id), eq(o.userId, c.get("user").id));
    return c.json(db.select(shape).from(cat).leftJoin(o, mine).orderBy(isNotNull(cat.parentId), isNull(o.sort), o.sort, cat.sort).all());
  });

  app.post("/api/categories", async (c) => {
    const input = await body(c, newCategory);
    if ("error" in input) return c.json(input, 400);
    const { parentId } = input.data;
    if (parentId !== null && !db.select().from(cat).where(and(eq(cat.id, parentId), isNull(cat.parentId))).get())
      return c.json({ error: "Invalid parent category" }, 400);
    const sort = sql`(SELECT coalesce(max(sort), -1) + 1 FROM categories WHERE parent_id IS ${parentId})`;
    const { id } = db.insert(cat).values({ ...input.data, sort }).returning({ id: cat.id }).get();
    return c.json(categories(db, eq(cat.id, id)).get(), 201);
  });

  app.put("/api/categories/order", async (c) => {
    const ids = await body(c, order);
    if ("error" in ids) return c.json(ids, 400);
    const userId = c.get("user").id;
    const known = categories(db, inArray(cat.id, ids.data)).all().map((k) => k.id);
    db.transaction(() =>
      ids.data
        .filter((id) => known.includes(id))
        .forEach((categoryId, sort) => db.insert(o).values({ userId, categoryId, sort }).onConflictDoUpdate({ target: [o.userId, o.categoryId], set: { sort } }).run()),
    );
    return c.json({});
  });

  app.put("/api/categories/:id", async (c) => {
    const id = Number(c.req.param("id"));
    const old = categories(db, eq(cat.id, id)).get();
    if (!old) return c.json({ error: "Not found" }, 404);
    const input = await body(c, categoryInput.partial());
    if ("error" in input) return c.json(input, 400);
    const { name, icon, color } = old;
    db.update(cat).set({ name, icon, color, ...input.data }).where(eq(cat.id, id)).run();
    return c.json(categories(db, eq(cat.id, id)).get());
  });

  app.delete("/api/categories/:id", (c) => {
    const id = Number(c.req.param("id"));
    const old = categories(db, eq(cat.id, id)).get();
    if (!old) return c.json({ error: "Not found" }, 404);
    if (old.builtin) return c.json({ error: "Uncategorised can’t be deleted" }, 400);
    const q = query(c, deletion);
    if ("error" in q) return c.json(q, 400);
    const target = q.data.moveTo ?? uncategorised(db);
    if (!db.select().from(cat).where(and(eq(cat.id, target), ne(cat.id, id), sql`${cat.parentId} IS NOT ${id}`)).get())
      return c.json({ error: "Invalid category to move to" }, 400);
    const family = or(eq(cat.id, id), eq(cat.parentId, id));
    const members = db.select({ id: cat.id }).from(cat).where(family);
    db.transaction(() => {
      db.update(e).set({ categoryId: target }).where(inArray(e.categoryId, members)).run();
      db.update(r).set({ categoryId: target }).where(inArray(r.categoryId, members)).run();
      db.delete(cat).where(family).run();
    });
    return c.json({});
  });

  app.get("/api/tags", (c) => c.json(db.select().from(t.tags).orderBy(t.tags.name).all()));

  app.put("/api/tags/:id", async (c) => {
    const input = await body(c, tagInput);
    if ("error" in input) return c.json(input, 400);
    const { name } = input.data;
    const id = Number(c.req.param("id"));
    if (db.select().from(t.tags).where(and(eq(t.tags.name, name), ne(t.tags.id, id))).get())
      return c.json({ error: "That tag already exists" }, 409);
    const old = retag(id, name);
    return old ? c.json({ id: old.id, name }) : c.json({ error: "Not found" }, 404);
  });

  app.delete("/api/tags/:id", (c) => (retag(Number(c.req.param("id")), null) ? c.json({}) : c.json({ error: "Not found" }, 404)));

  const retag = (id: number, name: string | null) =>
    db.transaction(() => {
      const old = db.select().from(t.tags).where(eq(t.tags.id, id)).get();
      if (!old) return null;
      db.update(r)
        .set({
          tags: sql`(SELECT json_group_array(CASE WHEN value = ${old.name} THEN ${name} ELSE value END)
          FROM json_each(recurring.tags) WHERE ${name} IS NOT NULL OR value != ${old.name})`,
        })
        .run();
      if (name === null) db.delete(t.tags).where(eq(t.tags.id, id)).run();
      else db.update(t.tags).set({ name }).where(eq(t.tags.id, id)).run();
      return old;
    });

  return app;
}
