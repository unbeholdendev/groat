import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { knownCurrencies } from "../shared/amount";
import { confident, parse } from "../shared/parse";
import type { Ctx } from "./app";
import type { Env } from "./auth";
import { settings, today, uncategorised } from "./db";
import { addExpense, readExpense, suggestions } from "./expenses";
import { body } from "./request";
import { apiTokens } from "./schema";
import { aiEnabled } from "./ai";
import { extract, textInput } from "./draft";

const hash = (token: string) => new Bun.CryptoHasher("sha256").update(token).digest("hex");
const listed = { id: apiTokens.id, name: apiTokens.name, createdAt: apiTokens.createdAt, lastUsedAt: apiTokens.lastUsedAt };

export function captureRoutes(ctx: Ctx) {
  const { db, clock } = ctx;
  const app = new Hono();

  app.post("/api/capture", async (c) => {
    const now = clock().toISOString();
    const token = c.req.header("authorization")?.match(/^Bearer (\S+)$/)?.[1];
    const owner = token && db.update(apiTokens).set({ lastUsedAt: now }).where(eq(apiTokens.hash, hash(token))).returning({ userId: apiTokens.userId }).get();
    if (!owner) return c.json({ error: "Invalid token" }, 401);
    const parsed = await body(c, textInput);
    if ("error" in parsed) return c.json(parsed, 400);
    const { text } = parsed.data;
    const { lastCurrency, recentCurrencies } = settings(db);
    const p = parse(text, recentCurrencies);
    const guess = p.note.length > 1 ? suggestions(db, p.note)[0] : undefined;
    const input = {
      note: p.amount && p.note ? p.note : text,
      amount: p.amount ?? "0",
      currency: p.currency ?? (guess && knownCurrencies.has(guess.currency) ? guess.currency : undefined),
      unit: p.unit ?? undefined,
      categoryId: guess?.categoryId ?? undefined,
      tags: p.tags,
    };
    const sure = confident(p, guess?.categoryId);
    const read = !sure && aiEnabled(ctx.config) && (await extract(ctx, text).catch(() => undefined));
    if (read) return c.json(addExpense(db, now, read, owner.userId, "pending"), 201);
    const row = readExpense(input, db, today(clock), lastCurrency, uncategorised(db), !sure);
    if ("error" in row) return c.json(row, 400);
    return c.json(addExpense(db, now, row, owner.userId, sure ? "normal" : "pending"), 201);
  });

  return app;
}

export function tokenRoutes({ db, clock }: Ctx) {
  const app = new Hono<Env>();
  const mine = (userId: number) => eq(apiTokens.userId, userId);

  app.get("/api/tokens", (c) => c.json(db.select(listed).from(apiTokens).where(mine(c.get("user").id)).orderBy(desc(apiTokens.id)).all()));

  app.post("/api/tokens", async (c) => {
    const parsed = await body(c, z.object({ name: z.string("Enter a name").trim().min(1, "Enter a name") }));
    if ("error" in parsed) return c.json(parsed, 400);
    const token = `et_${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url")}`;
    const row = db
      .insert(apiTokens)
      .values({ userId: c.get("user").id, name: parsed.data.name, hash: hash(token), createdAt: clock().toISOString() })
      .returning(listed)
      .get();
    return c.json({ ...row, token }, 201);
  });

  app.delete("/api/tokens/:id", (c) => {
    const row = db.delete(apiTokens).where(and(eq(apiTokens.id, Number(c.req.param("id"))), mine(c.get("user").id))).returning(listed).get();
    return row ? c.json(row) : c.json({ error: "Not found" }, 404);
  });

  return app;
}
