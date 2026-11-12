import { eq, sql } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { Env } from "../auth/access";
import type { Ctx } from "../context";
import { log } from "../logging";
import { valid } from "../request";
import * as schema from "../schema";
import { key, plan } from "./import-plan";
import { addTransaction } from "./queries";

const upload = z.object({ file: z.file() });

const found = <T>(value: T | undefined) => {
  if (value === undefined) throw new Error("The import lost track of a category");
  return value;
};

export function importRoutes({ db, clock }: Pick<Ctx, "db" | "clock">) {
  const app = new Hono<Env>();
  const used = "Import only works before any expenses are added";
  const empty = () =>
    !db.$client
      .query("SELECT 1 FROM transactions UNION ALL SELECT 1 FROM recurring UNION ALL SELECT 1 FROM tags")
      .get();

  const limit = bodyLimit({
    maxSize: 20 * 1024 * 1024,
    onError: (c) => c.json({ error: "That file is too large" }, 413),
  });

  const read = async (c: Context<Env>) => {
    if (c.get("user").role !== "admin") return c.json({ error: "Only admins can do that" }, 403);
    const parsed = valid(upload, await c.req.parseBody().catch(() => undefined));
    if ("error" in parsed) return c.json({ error: "Choose a CSV file" }, 400);
    const text = await parsed.data.file.text();
    if (!empty()) return c.json({ error: used }, 409);
    const result = plan({ db, clock }, text);
    if ("error" in result) return c.json(result, 400);
    return result;
  };

  app.post("/api/import/preview", limit, async (c) => {
    const result = await read(c);
    return result instanceof Response ? result : c.json(result.preview);
  });

  app.post("/api/import", limit, async (c) => {
    const result = await read(c);
    if (result instanceof Response) return result;
    if (result.preview.rejected.length) return c.json({ error: "Fix the rejected rows, then import again" }, 400);
    // read() awaited the upload after its check, so another import may have finished since.
    if (!empty()) return c.json({ error: used }, 409);
    const { rows, created, existing, kinds } = result;
    const now = clock().toISOString();
    const userId = c.get("user").id;
    db.transaction(() => {
      const parents = [...created.values()].sort((a, b) => a.length - b.length);
      for (const [name, sub] of parents) {
        const parentId = sub ? found(existing.get(key(name))) : null;
        const color = parentId
          ? found(
              db
                .select({ color: schema.categories.color })
                .from(schema.categories)
                .where(eq(schema.categories.id, parentId))
                .get(),
            ).color
          : "#71717a";
        const sort = sql`(SELECT coalesce(max(sort), -1) + 1 FROM categories WHERE parent_id IS ${parentId})`;
        const { id } = db
          .insert(schema.categories)
          .values({ name: sub ?? name, icon: "🏷️", color, parentId, sort, kind: kinds.get(key(name)) })
          .returning({ id: schema.categories.id })
          .get();
        existing.set(sub ? key(name, sub) : key(name), id);
      }
      for (const { at, ...row } of rows)
        addTransaction(db, now, { ...row, categoryId: at ? found(existing.get(at)) : row.categoryId }, userId);
    });
    log("info", "import.completed", { count: rows.length });
    return c.json({ imported: rows.length });
  });

  return app;
}
