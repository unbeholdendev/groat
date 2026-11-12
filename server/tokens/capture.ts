import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { knownCurrencies } from "../../shared/amount";
import { confident, parse } from "../../shared/parse";
import { extract, textInput } from "../ai/draft";
import type { Ctx } from "../context";
import { body } from "../request";
import { apiTokens } from "../schema";
import { settings } from "../settings/queries";
import { addTransaction, suggestions } from "../transactions/queries";
import { readTransaction } from "../transactions/read-transaction";
import { hashToken } from "./hash";

export function captureRoutes(ctx: Pick<Ctx, "db" | "clock" | "ai">) {
  const { db, clock } = ctx;
  const app = new Hono();

  app.post("/api/capture", async (c) => {
    const now = clock().toISOString();
    const token = c.req.header("authorization")?.match(/^Bearer (\S+)$/)?.[1];
    const owner =
      token &&
      db
        .update(apiTokens)
        .set({ lastUsedAt: now })
        .where(eq(apiTokens.hash, hashToken(token)))
        .returning({ userId: apiTokens.userId })
        .get();
    if (!owner) return c.json({ error: "Invalid token" }, 401);
    const parsed = await body(c, textInput);
    if ("error" in parsed) return c.json(parsed, 400);
    const { text } = parsed.data;
    const { recentCurrencies } = settings(db);
    const typed = parse(text, recentCurrencies);
    const guess = typed.note.length > 1 ? suggestions(db, typed.note)[0] : undefined;
    const input = {
      note: typed.amount && typed.note ? typed.note : text,
      amount: typed.amount ?? "0",
      currency: typed.currency ?? (guess && knownCurrencies.has(guess.currency) ? guess.currency : undefined),
      unit: typed.unit ?? undefined,
      categoryId: guess?.categoryId ?? undefined,
      tags: typed.tags,
    };
    const sure = confident(typed, guess?.categoryId);
    const read = !sure && (await extract(ctx, text).catch(() => undefined));
    if (read) return c.json(addTransaction(db, now, read, owner.userId, "pending"), 201);
    const row = readTransaction(ctx, input, { intent: "capture", pending: !sure });
    if ("error" in row) return c.json(row, 400);
    return c.json(addTransaction(db, now, row, owner.userId, sure ? "normal" : "pending"), 201);
  });

  return app;
}
