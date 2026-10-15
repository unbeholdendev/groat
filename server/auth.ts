import { and, eq, gt } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import type { Db } from "./db";
import { sessions, users } from "./schema";

const credentials = z.object({ username: z.string().trim().min(1), password: z.string().min(1) });
const days = 30;

export function auth(db: Db, clock: () => Date) {
  const app = new Hono();

  const session = (c: Context) =>
    db
      .select({ id: sessions.id, userId: users.id, username: users.username, role: users.role })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.id, getCookie(c, "session") ?? ""), gt(sessions.expiresAt, clock().toISOString())))
      .get();

  const signIn = (c: Context, id: string, userId: number) => {
    const expiresAt = new Date(clock().getTime() + days * 864e5).toISOString();
    db.insert(sessions).values({ id, userId, expiresAt }).onConflictDoUpdate({ target: sessions.id, set: { expiresAt } }).run();
    const secure = c.req.url.startsWith("https:") || c.req.header("x-forwarded-proto") === "https";
    setCookie(c, "session", id, { httpOnly: true, sameSite: "Lax", path: "/", maxAge: days * 86400, secure });
  };

  const body = async (c: Context) => credentials.safeParse(await c.req.json().catch(() => null));

  app.get("/api/session", (c) => {
    const user = session(c);
    return c.json({ setup: !db.select().from(users).get(), user: user ? { username: user.username, role: user.role } : null });
  });

  app.post("/api/setup", async (c) => {
    const parsed = await body(c);
    if (!parsed.success) return c.json({ error: "username and password are required" }, 400);
    const { username, password } = parsed.data;
    const passwordHash = await Bun.password.hash(password);
    if (db.select().from(users).get()) return c.json({ error: "already set up" }, 409);
    const { id } = db.insert(users).values({ username, passwordHash, role: "admin" }).returning({ id: users.id }).get();
    signIn(c, crypto.randomUUID(), id);
    return c.json({ username, role: "admin" }, 201);
  });

  app.post("/api/login", async (c) => {
    const parsed = await body(c);
    const user = parsed.success ? db.select().from(users).where(eq(users.username, parsed.data.username)).get() : undefined;
    if (!parsed.success || !user || !(await Bun.password.verify(parsed.data.password, user.passwordHash)))
      return c.json({ error: "wrong username or password" }, 401);
    signIn(c, crypto.randomUUID(), user.id);
    return c.json({ username: user.username, role: user.role });
  });

  app.use("/api/*", async (c, next) => {
    const current = session(c);
    if (!current) return c.json({ error: "sign in first" }, 401);
    signIn(c, current.id, current.userId);
    await next();
  });

  app.post("/api/logout", (c) => {
    db.delete(sessions).where(eq(sessions.id, getCookie(c, "session") ?? "")).run();
    deleteCookie(c, "session", { path: "/" });
    return c.json({});
  });

  return app;
}
