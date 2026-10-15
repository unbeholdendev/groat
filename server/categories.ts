import { and, eq, inArray, isNotNull, isNull, ne, or, type SQL, sql } from "drizzle-orm";
import { Hono } from "hono";
import { type Db, uncategorised } from "./db";
import { filled, json } from "./request";
import * as t from "./schema";

const cat = t.categories;
const e = t.expenses;
const r = t.recurring;

export const categories = (db: Db, where?: SQL) =>
  db.select({ id: cat.id, name: cat.name, icon: cat.icon, color: cat.color, parentId: cat.parentId, builtin: cat.builtin }).from(cat).where(where);

export function categoryRoutes(db: Db) {
  const app = new Hono();

  app.get("/api/categories", (c) => c.json(categories(db).orderBy(isNotNull(cat.parentId), cat.sort).all()));

  app.post("/api/categories", async (c) => {
    const { name, icon, color, parentId = null } = await json(c);
    if (!filled(name, icon, color)) return c.json({ error: "name, icon and colour are required" }, 400);
    if (parentId !== null && !db.select().from(cat).where(and(eq(cat.id, parentId), isNull(cat.parentId))).get())
      return c.json({ error: "invalid parent" }, 400);
    const sort = sql`(SELECT coalesce(max(sort), -1) + 1 FROM categories WHERE parent_id IS ${parentId})`;
    const { id } = db.insert(cat).values({ name: name.trim(), icon, color, parentId, sort }).returning({ id: cat.id }).get();
    return c.json(categories(db, eq(cat.id, id)).get(), 201);
  });

  app.put("/api/categories/order", async (c) => {
    const ids = await json(c);
    if (!Array.isArray(ids) || !ids.every(Number.isInteger)) return c.json({ error: "expected a list of ids" }, 400);
    db.transaction(() => ids.forEach((id, i) => db.update(cat).set({ sort: i }).where(eq(cat.id, id)).run()));
    return c.json({});
  });

  app.put("/api/categories/:id", async (c) => {
    const id = Number(c.req.param("id"));
    const old = categories(db, eq(cat.id, id)).get();
    if (!old) return c.json({ error: "not found" }, 404);
    const { name, icon, color } = { ...old, ...(await json(c)) };
    if (!filled(name, icon, color)) return c.json({ error: "name, icon and colour are required" }, 400);
    db.update(cat).set({ name: name.trim(), icon, color }).where(eq(cat.id, id)).run();
    return c.json(categories(db, eq(cat.id, id)).get());
  });

  app.delete("/api/categories/:id", (c) => {
    const id = Number(c.req.param("id"));
    const old = categories(db, eq(cat.id, id)).get();
    if (!old) return c.json({ error: "not found" }, 404);
    if (old.builtin) return c.json({ error: "Uncategorised cannot be deleted" }, 400);
    const moveTo = Number(c.req.query("moveTo") ?? uncategorised(db));
    if (!db.select().from(cat).where(and(eq(cat.id, moveTo), ne(cat.id, id), sql`${cat.parentId} IS NOT ${id}`)).get())
      return c.json({ error: "invalid moveTo" }, 400);
    const family = or(eq(cat.id, id), eq(cat.parentId, id));
    const members = db.select({ id: cat.id }).from(cat).where(family);
    db.transaction(() => {
      db.update(e).set({ categoryId: moveTo }).where(inArray(e.categoryId, members)).run();
      db.update(r).set({ categoryId: moveTo }).where(inArray(r.categoryId, members)).run();
      db.delete(cat).where(family).run();
    });
    return c.json({});
  });

  app.get("/api/tags", (c) => c.json(db.select().from(t.tags).orderBy(t.tags.name).all()));

  app.put("/api/tags/:id", async (c) => {
    const { name } = await json(c);
    const id = Number(c.req.param("id"));
    if (!filled(name)) return c.json({ error: "name is required" }, 400);
    if (db.select().from(t.tags).where(and(eq(t.tags.name, name.trim()), ne(t.tags.id, id))).get())
      return c.json({ error: "tag already exists" }, 409);
    const old = retag(id, name.trim());
    return old ? c.json({ id: old.id, name: name.trim() }) : c.json({ error: "not found" }, 404);
  });

  app.delete("/api/tags/:id", (c) => (retag(Number(c.req.param("id")), null) ? c.json({}) : c.json({ error: "not found" }, 404)));

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
