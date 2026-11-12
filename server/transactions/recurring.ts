import { and, eq, getTableColumns, isNull, type SQL } from "drizzle-orm";
import { z } from "zod";
import { isoDate, transactionInput } from "../../shared/schema";
import { type Ctx, today } from "../context";
import type { Db } from "../db";
import { errorKind, log } from "../logging";
import { valid } from "../request";
import * as schema from "../schema";
import { saveTags } from "./queries";
import { type Intent, readTransaction } from "./read-transaction";

export const schedule = transactionInput.omit({ date: true }).extend({
  period: z.enum(["day", "week", "month", "year"], "Invalid schedule"),
  every: z.number("Invalid schedule").int("Invalid schedule").min(1, "Invalid schedule"),
  startDate: isoDate.optional(),
  endDate: isoDate.nullable().default(null),
  needsConfirmation: z.boolean().default(false),
});

const { deletedAt: _, ...templateColumns } = getTableColumns(schema.recurring);
export const templates = (db: Db, where?: SQL) =>
  db
    .select(templateColumns)
    .from(schema.recurring)
    .where(and(isNull(schema.recurring.deletedAt), where));

export const readTemplate = (ctx: Pick<Ctx, "db" | "clock">, raw: unknown, intent: Intent) => {
  const input = valid(schedule, raw);
  if ("error" in input) return input;
  const fields = readTransaction(ctx, input.data, intent);
  if ("error" in fields) return fields;
  const { period, every, startDate = today(ctx.clock), endDate, needsConfirmation } = input.data;
  const { note, amount, currency, categoryId, tags } = fields;
  return { note, amount, currency, categoryId, tags, period, every, startDate, endDate, needsConfirmation };
};

export function generateRecurring({ db, clock }: Pick<Ctx, "db" | "clock">, skip?: string) {
  const start = performance.now();
  let count = 0;
  log("debug", "recurring.generate.started");
  try {
    const now = clock().toISOString();
    const rows = db
      .select()
      .from(schema.recurring)
      .where(
        skip
          ? eq(schema.recurring.id, Number(skip))
          : and(isNull(schema.recurring.deletedAt), eq(schema.recurring.paused, false)),
      )
      .all();
    db.transaction(() => {
      for (const template of rows) {
        let last = template.lastDate;
        let due = following(last, template);
        while (due <= today(clock) && (!template.endDate || due <= template.endDate)) {
          if (!skip) {
            const status = template.needsConfirmation ? "pending" : "normal";
            const { note, amount, currency, categoryId } = template;
            const values = {
              note,
              amount,
              currency,
              date: due,
              categoryId,
              recurringId: template.id,
              status,
              createdAt: now,
              updatedAt: now,
            };
            const { id } = db
              .insert(schema.transactions)
              .values(values)
              .returning({ id: schema.transactions.id })
              .get();
            saveTags(db, id, template.tags);
            count++;
          }
          last = due;
          due = following(last, template);
        }
        db.update(schema.recurring).set({ lastDate: last }).where(eq(schema.recurring.id, template.id)).run();
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

const following = (last: string | null, template: typeof schema.recurring.$inferSelect) =>
  last && last >= template.startDate ? next(last, template) : template.startDate;

function next(last: string, { period, every, startDate }: typeof schema.recurring.$inferSelect) {
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
