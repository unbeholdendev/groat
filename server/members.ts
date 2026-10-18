import { and, count, eq, ne } from "drizzle-orm";
import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { z } from "zod";
import { active, credentials, type Env } from "./auth";
import type { Db } from "./db";
import { body } from "./request";
import { apiTokens, sessions, users } from "./schema";

const password = z.object({ password: credentials.shape.password });

export function memberRoutes(db: Db, clock: () => Date) {
  const app = new Hono<Env>();
  const member = (id: string) => and(eq(users.id, Number(id)), active);
  const list = () => db.select({ id: users.id, username: users.username, role: users.role }).from(users).where(active).orderBy(users.id).all();

  app.use("/api/users/*", async (c, next) => {
    if (c.get("user").role !== "admin") return c.json({ error: "Only admins can do that" }, 403);
    await next();
  });

  app.get("/api/users", (c) => c.json(list()));

  app.post("/api/users", async (c) => {
    const parsed = await body(c, credentials);
    if ("error" in parsed) return c.json(parsed, 400);
    const { username } = parsed.data;
    if (db.select().from(users).where(eq(users.username, username)).get()) return c.json({ error: "That username is taken" }, 409);
    const passwordHash = await Bun.password.hash(parsed.data.password);
    const { id } = db.insert(users).values({ username, passwordHash, role: "member" }).returning({ id: users.id }).get();
    return c.json({ id, username, role: "member" }, 201);
  });

  app.put("/api/users/:id/password", async (c) => {
    const parsed = await body(c, password);
    if ("error" in parsed) return c.json(parsed, 400);
    const passwordHash = await Bun.password.hash(parsed.data.password);
    const row = db.update(users).set({ passwordHash }).where(member(c.req.param("id"))).returning({ id: users.id }).get();
    if (!row) return c.json({ error: "Not found" }, 404);
    db.delete(sessions).where(and(eq(sessions.userId, row.id), ne(sessions.id, getCookie(c, "session") ?? ""))).run();
    return c.json({});
  });

  app.delete("/api/users/:id", (c) => {
    const user = db.select().from(users).where(member(c.req.param("id"))).get();
    if (!user) return c.json({ error: "Not found" }, 404);
    if (user.role === "admin" && db.select({ n: count() }).from(users).where(and(eq(users.role, "admin"), active)).get()?.n === 1) return c.json({ error: "The last admin can’t be removed" }, 409);
    db.update(users).set({ deletedAt: clock().toISOString() }).where(eq(users.id, user.id)).run();
    db.delete(sessions).where(eq(sessions.userId, user.id)).run();
    db.delete(apiTokens).where(eq(apiTokens.userId, user.id)).run();
    return c.json({});
  });

  return app;
}
