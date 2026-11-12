import { and, eq, ne } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../auth/access";
import type { Ctx } from "../context";
import { body } from "../request";
import * as schema from "../schema";
import { retag } from "./queries";

export const tagInput = z.object({ name: z.string("Enter a name").trim().min(1, "Enter a name") });

export function tagRoutes({ db }: Pick<Ctx, "db">) {
  const app = new Hono<Env>();

  app.get("/api/tags", (c) => c.json(db.select().from(schema.tags).orderBy(schema.tags.name).all()));

  app.put("/api/tags/:id", async (c) => {
    const input = await body(c, tagInput);
    if ("error" in input) return c.json(input, 400);
    const { name } = input.data;
    const id = Number(c.req.param("id"));
    if (
      db
        .select()
        .from(schema.tags)
        .where(and(eq(schema.tags.name, name), ne(schema.tags.id, id)))
        .get()
    )
      return c.json({ error: "That tag already exists" }, 409);
    const old = retag(db, id, name);
    return old ? c.json({ id: old.id, name }) : c.json({ error: "Not found" }, 404);
  });

  app.delete("/api/tags/:id", (c) =>
    retag(db, Number(c.req.param("id")), null) ? c.json({}) : c.json({ error: "Not found" }, 404),
  );

  return app;
}
