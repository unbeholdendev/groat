import { and, eq, getTableColumns, isNull, type SQL } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { z } from "zod";
import { transactionInput, isoDate } from "../shared/schema";
import type { Ctx } from "./app";
import { today } from "./db";
import { readTransaction, type Intent } from "./read-transaction";
import { saveTags } from "./transactions";
import { json, valid } from "./request";
import * as t from "./schema";
import { errorKind, log } from "./logging";

const e = t.transactions;
const r = t.recurring;

export const schedule = transactionInput.omit({ date: true }).extend({
  period: z.enum(["day", "week", "month", "year"], "Invalid schedule"),
  every: z.number("Invalid schedule").int("Invalid schedule").min(1, "Invalid schedule"),
  startDate: isoDate.optional(),
  endDate: isoDate.nullable().default(null),
  needsConfirmation: z.boolean().default(false),
});

export function recurringRoutes(ctx: Ctx) {
  const { db, clock } = ctx;
  const app = new Hono();

  const { deletedAt: _, ...templateColumns } = getTableColumns(r);
  const templates = (where?: SQL) =>
    db
      .select(templateColumns)
      .from(r)
      .where(and(isNull(r.deletedAt), where));

  const readTemplate = (raw: unknown, intent: Intent) => {
    const input = valid(schedule, raw);
    if ("error" in input) return input;
    const e = readTransaction(ctx, input.data, intent);
    if ("error" in e) return e;
    const { period, every, startDate = today(clock), endDate, needsConfirmation } = input.data;
    const { note, amount, currency, categoryId, tags } = e;
    return { note, amount, currency, categoryId, tags, period, every, startDate, endDate, needsConfirmation };
  };

  function generate(skip?: string) {
    const start = performance.now();
    let count = 0;
    log("debug", "recurring.generate.started");
    try {
      const now = clock().toISOString();
      const rows = db
        .select()
        .from(r)
        .where(skip ? eq(r.id, Number(skip)) : and(isNull(r.deletedAt), eq(r.paused, false)))
        .all();
      db.transaction(() => {
        for (const tpl of rows) {
          let last = tpl.lastDate;
          for (
            let d;
            (d = last && last >= tpl.startDate ? next(last, tpl) : tpl.startDate) <= today(clock) &&
            (!tpl.endDate || d <= tpl.endDate);
            last = d
          ) {
            if (skip) continue;
            const status = tpl.needsConfirmation ? "pending" : "normal";
            const { note, amount, currency, categoryId } = tpl;
            const values = {
              note,
              amount,
              currency,
              date: d,
              categoryId,
              recurringId: tpl.id,
              status,
              createdAt: now,
              updatedAt: now,
            };
            const { id } = db.insert(e).values(values).returning({ id: e.id }).get();
            saveTags(db, id, tpl.tags);
            count++;
          }
          db.update(r).set({ lastDate: last }).where(eq(r.id, tpl.id)).run();
        }
      });
      log("info", "recurring.generate.completed", { count, durationMs: Math.round(performance.now() - start) });
    } catch (error) {
      log("error", "recurring.generate.failed", {
        error: errorKind(error),
        durationMs: Math.round(performance.now() - start),
      });
      throw error;
    }
  }

  app.get("/api/recurring", (c) => c.json(templates().orderBy(r.id).all()));

  app.post("/api/recurring", async (c) => {
    const t = readTemplate(await json(c), { intent: "add" });
    if ("error" in t) return c.json(t, 400);
    const { id } = db.insert(r).values(t).returning({ id: r.id }).get();
    generate();
    return c.json(templates(eq(r.id, id)).get(), 201);
  });

  app.put("/api/recurring/:id", async (c) => {
    const id = Number(c.req.param("id"));
    const old = templates(eq(r.id, id)).get();
    if (!old) return c.json({ error: "Not found" }, 404);
    const t = readTemplate(await json(c), { intent: "edit", old });
    if ("error" in t) return c.json(t, 400);
    db.update(r).set(t).where(eq(r.id, id)).run();
    generate();
    return c.json(templates(eq(r.id, id)).get());
  });

  const setTemplate = (c: Context, set: Partial<typeof r.$inferInsert>) => {
    const id = Number(c.req.param("id"));
    return db
      .update(r)
      .set(set)
      .where(and(eq(r.id, id), isNull(r.deletedAt)))
      .returning({ id: r.id })
      .get()
      ? c.json(templates(eq(r.id, id)).get() ?? {})
      : c.json({ error: "Not found" }, 404);
  };

  app.post("/api/recurring/:id/pause", (c) => setTemplate(c, { paused: true }));
  app.post("/api/recurring/:id/resume", (c) => (generate(c.req.param("id")), setTemplate(c, { paused: false })));
  app.delete("/api/recurring/:id", (c) => setTemplate(c, { deletedAt: clock().toISOString() }));

  return Object.assign(app, { generate: () => generate() });
}

function next(last: string, { period, every, startDate }: typeof t.recurring.$inferSelect) {
  const [y, m, d] = last.split("-").map(Number);
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  if (period === "day" || period === "week")
    return iso(new Date(Date.UTC(y, m - 1, d + every * (period === "week" ? 7 : 1))));
  const month = m - 1 + every * (period === "year" ? 12 : 1);
  return iso(
    new Date(
      Date.UTC(y, month, Math.min(Number(startDate.slice(8)), new Date(Date.UTC(y, month + 1, 0)).getUTCDate())),
    ),
  );
}
