import { and, desc, eq, getTableColumns, gte, inArray, isNull, lte, or, type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { isoDate, type Kind, kind } from "../../shared/schema";
import type { Db } from "../db";
import * as schema from "../schema";
import type { TransactionFields } from "./read-transaction";
const { createdAt, updatedAt, deletedAt, createdBy, clientRequestId, ...transactionColumns } = getTableColumns(
  schema.transactions,
);

export const visible = isNull(schema.transactions.deletedAt);
export const countable = and(visible, eq(schema.transactions.status, "normal"));
export const kindOf = sql<Kind>`coalesce((SELECT kind FROM categories WHERE categories.id = ${schema.transactions.categoryId}), 'expense')`;

export const newest = [desc(schema.transactions.date), desc(schema.transactions.id)];

const tagList = z.array(z.string());

export const transactions = (db: Db, where?: SQL) =>
  db
    .select({
      ...transactionColumns,
      tags: sql`(SELECT json_group_array(name) FROM (SELECT name FROM transaction_tags JOIN tags ON tags.id = tag_id
        WHERE transaction_id = transactions.id ORDER BY name))`.mapWith((v: string) => tagList.parse(JSON.parse(v))),
      addedBy: sql<string | null>`(SELECT username FROM users WHERE users.id = transactions.created_by)`,
      attachmentId: sql<number | null>`(SELECT id FROM attachments WHERE transaction_id = transactions.id)`,
    })
    .from(schema.transactions)
    .where(where);

export const transactionQuery = z
  .object({
    from: isoDate.describe("YYYY-MM-DD"),
    to: isoDate.describe("YYYY-MM-DD"),
    category: z.coerce.number().int().describe("category id; includes its subcategories"),
    tag: z.string(),
    currency: z.string(),
    status: z.enum(["normal", "pending"]),
    kind: kind.describe("expense or income, from the category"),
    q: z.string().describe("text the note contains"),
  })
  .partial();

export function transactionFilter(db: Db, q: z.infer<typeof transactionQuery>, base = visible) {
  const category = q.category;
  return and(
    base,
    q.from ? gte(schema.transactions.date, q.from) : undefined,
    q.to ? lte(schema.transactions.date, q.to) : undefined,
    category !== undefined
      ? inArray(
          schema.transactions.categoryId,
          db
            .select({ id: schema.categories.id })
            .from(schema.categories)
            .where(or(eq(schema.categories.id, category), eq(schema.categories.parentId, category))),
        )
      : undefined,
    q.tag
      ? inArray(
          schema.transactions.id,
          db
            .select({ id: schema.transactionTags.transactionId })
            .from(schema.transactionTags)
            .innerJoin(schema.tags, eq(schema.tags.id, schema.transactionTags.tagId))
            .where(eq(schema.tags.name, q.tag)),
        )
      : undefined,
    q.currency ? eq(schema.transactions.currency, q.currency) : undefined,
    q.status ? eq(schema.transactions.status, q.status) : undefined,
    q.kind ? eq(kindOf, q.kind) : undefined,
    q.q ? sql`instr(lower(${schema.transactions.note}), lower(${q.q}))` : undefined,
  );
}

export function addTransaction(
  db: Db,
  now: string,
  { tags, ...fields }: TransactionFields,
  createdBy: number,
  status = "normal",
  attachmentId?: number,
) {
  const { id } = db
    .insert(schema.transactions)
    .values({ ...fields, status, createdBy, createdAt: now, updatedAt: now })
    .returning({ id: schema.transactions.id })
    .get();
  saveTags(db, id, tags);
  if (attachmentId)
    db.update(schema.attachments)
      .set({ transactionId: id })
      .where(and(eq(schema.attachments.id, attachmentId), isNull(schema.attachments.transactionId)))
      .run();
  return savedTransaction(db, id);
}

export function savedTransaction(db: Db, id: number) {
  const row = transactions(db, eq(schema.transactions.id, id)).get();
  if (!row) throw new Error("The transaction was not saved");
  return row;
}

export function suggestions(db: Db, prefix: string) {
  const ranked = db
    .select({
      note: schema.transactions.note,
      categoryId: schema.transactions.categoryId,
      currency: schema.transactions.currency,
      amount: schema.transactions.amount,
      date: schema.transactions.date,
      id: schema.transactions.id,
      n: sql<number>`row_number() OVER (PARTITION BY ${schema.transactions.note} ORDER BY ${schema.transactions.date} DESC, ${schema.transactions.id} DESC)`.as(
        "n",
      ),
    })
    .from(schema.transactions)
    .where(and(visible, sql`lower(substr(${schema.transactions.note}, 1, length(${prefix}))) = lower(${prefix})`))
    .as("ranked");
  const { note, categoryId, currency, amount } = ranked;
  return db
    .select({ note, categoryId, currency, amount })
    .from(ranked)
    .where(eq(ranked.n, 1))
    .orderBy(desc(ranked.date), desc(ranked.id))
    .limit(10)
    .all();
}

export function saveTags(db: Db, id: number, tags: string[]) {
  db.delete(schema.transactionTags).where(eq(schema.transactionTags.transactionId, id)).run();
  for (const name of tags) {
    const { tagId } = db
      .insert(schema.tags)
      .values({ name })
      .onConflictDoUpdate({ target: schema.tags.name, set: { name } })
      .returning({ tagId: schema.tags.id })
      .get();
    db.insert(schema.transactionTags).values({ transactionId: id, tagId }).run();
  }
}
