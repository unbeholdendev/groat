import { and, count, eq, ne } from "drizzle-orm";
import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { z } from "zod";
import { active, admin, credentials, type Env, hashCost } from "./auth";
import type { Db } from "./db";
import { body } from "./request";
import { apiTokens, sessions, users } from "./schema";

const password = z.object({ password: credentials.shape.password });

export function memberRoutes(db: Db, clock: () => Date) {
  const app = new Hono<Env>();
  const member = (id: string) => and(eq(users.id, Number(id)), active);
  const list = () => db.select({ id: users.id, username: users.username, role: users.role }).from(users).where(active).orderBy(users.id).all();

  app.put("/api/password", async (c) => {
    const parsed = await body(c, password.extend({ currentPassword: credentials.shape.password }));
    if ("error" in parsed) return c.json(parsed, 400);
    const id = c.get("user").id;
    const user = db.select().from(users).where(and(eq(users.id, id), active)).get();
    if (!user || !(await Bun.password.verify(parsed.data.currentPassword, user.passwordHash)))
      return c.json({ error: "Current password is incorrect" }, 400);
    const passwordHash = await Bun.password.hash(parsed.data.password, hashCost);
    const changed = db.transaction((tx) => {
      const row = tx.update(users).set({ passwordHash }).where(and(eq(users.id, id), active, eq(users.passwordHash, user.passwordHash))).returning({ id: users.id }).get();
      if (!row) return false;
      tx.delete(sessions).where(and(eq(sessions.userId, id), ne(sessions.id, getCookie(c, "session") ?? ""))).run();
      return true;
    });
    return changed ? c.json({}) : c.json({ error: "Account changed. Try again." }, 409);
  });

  app.use("/api/users/*", admin);

  app.get("/api/users", (c) => c.json(list()));

  app.post("/api/users", async (c) => {
    const parsed = await body(c, credentials);
    if ("error" in parsed) return c.json(parsed, 400);
    const { username } = parsed.data;
    if (db.select().from(users).where(eq(users.username, username)).get()) return c.json({ error: "That username is taken" }, 409);
    const passwordHash = await Bun.password.hash(parsed.data.password, hashCost);
    const { id } = db.insert(users).values({ username, passwordHash, role: "member" }).returning({ id: users.id }).get();
    return c.json({ id, username, role: "member" }, 201);
  });

  app.put("/api/users/:id/password", async (c) => {
    const parsed = await body(c, password);
    if ("error" in parsed) return c.json(parsed, 400);
    const passwordHash = await Bun.password.hash(parsed.data.password, hashCost);
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
