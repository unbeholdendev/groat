import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../auth/access";
import type { Ctx } from "../context";
import { body } from "../request";
import { apiTokens } from "../schema";
import { hashToken } from "./hash";

const listed = {
  id: apiTokens.id,
  name: apiTokens.name,
  createdAt: apiTokens.createdAt,
  lastUsedAt: apiTokens.lastUsedAt,
};

export function tokenRoutes({ db, clock }: Pick<Ctx, "db" | "clock">) {
  const app = new Hono<Env>();
  const mine = (userId: number) => eq(apiTokens.userId, userId);

  app.get("/api/tokens", (c) =>
    c.json(
      db
        .select(listed)
        .from(apiTokens)
        .where(mine(c.get("user").id))
        .orderBy(desc(apiTokens.id))
        .all(),
    ),
  );

  app.post("/api/tokens", async (c) => {
    const parsed = await body(c, z.object({ name: z.string("Enter a name").trim().min(1, "Enter a name") }));
    if ("error" in parsed) return c.json(parsed, 400);
    const token = `et_${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url")}`;
    const row = db
      .insert(apiTokens)
      .values({
        userId: c.get("user").id,
        name: parsed.data.name,
        hash: hashToken(token),
        createdAt: clock().toISOString(),
      })
      .returning(listed)
      .get();
    return c.json({ ...row, token }, 201);
  });

  app.delete("/api/tokens/:id", (c) => {
    const row = db
      .delete(apiTokens)
      .where(and(eq(apiTokens.id, Number(c.req.param("id"))), mine(c.get("user").id)))
      .returning(listed)
      .get();
    return row ? c.json(row) : c.json({ error: "Not found" }, 404);
  });

  return app;
}
