import { type AnySQLiteColumn, blob, check, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const transactions = sqliteTable("transactions", {
  id: integer().primaryKey(),
  clientRequestId: text().unique(),
  note: text().notNull(),
  amount: integer().notNull(),
  currency: text().notNull(),
  date: text().notNull(),
  createdAt: text().notNull(),
  updatedAt: text().notNull(),
  deletedAt: text(),
  categoryId: integer().references(() => categories.id),
  recurringId: integer().references(() => recurring.id),
  status: text().notNull().default("normal"),
  createdBy: integer().references((): AnySQLiteColumn => users.id),
});

export const settings = sqliteTable(
  "settings",
  {
    id: integer().primaryKey(),
    baseCurrency: text().notNull(),
    theme: text().notNull(),
    onboarded: integer({ mode: "boolean" }).notNull(),
  },
  (t) => [check("single_row", sql`${t.id} = 1`)],
);

export const categories = sqliteTable("categories", {
  id: integer().primaryKey(),
  name: text().notNull(),
  icon: text().notNull(),
  color: text().notNull(),
  parentId: integer().references((): AnySQLiteColumn => categories.id),
  sort: integer().notNull(),
  builtin: integer({ mode: "boolean" }).notNull().default(false),
});

export const rates = sqliteTable(
  "rates",
  {
    date: text().notNull(),
    currency: text().notNull(),
    rate: real().notNull(),
    source: text().notNull(),
  },
  (t) => [primaryKey({ columns: [t.date, t.currency] })],
);

export const tags = sqliteTable("tags", {
  id: integer().primaryKey(),
  name: text().notNull().unique(),
});

export const transactionTags = sqliteTable(
  "transaction_tags",
  {
    transactionId: integer()
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    tagId: integer()
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.transactionId, t.tagId] })],
);

export const recurring = sqliteTable("recurring", {
  id: integer().primaryKey(),
  note: text().notNull(),
  amount: integer().notNull(),
  currency: text().notNull(),
  categoryId: integer()
    .notNull()
    .references(() => categories.id),
  tags: text({ mode: "json" }).notNull().$type<string[]>(),
  period: text().notNull(),
  every: integer().notNull(),
  startDate: text().notNull(),
  endDate: text(),
  needsConfirmation: integer({ mode: "boolean" }).notNull(),
  paused: integer({ mode: "boolean" }).notNull().default(false),
  lastDate: text(),
  deletedAt: text(),
});

export const users = sqliteTable("users", {
  id: integer().primaryKey(),
  username: text().notNull().unique(),
  passwordHash: text().notNull(),
  role: text().notNull(),
  deletedAt: text(),
});

export const sessions = sqliteTable("sessions", {
  id: text().primaryKey(),
  userId: integer()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: text().notNull(),
});

export const apiTokens = sqliteTable("api_tokens", {
  id: integer().primaryKey(),
  userId: integer()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text().notNull(),
  hash: text().notNull().unique(),
  createdAt: text().notNull(),
  lastUsedAt: text(),
});

export const attachments = sqliteTable("attachments", {
  id: integer().primaryKey(),
  transactionId: integer().references(() => transactions.id, { onDelete: "cascade" }),
  mime: text().notNull(),
  bytes: blob({ mode: "buffer" }).notNull(),
  createdAt: text().notNull(),
});

export const chats = sqliteTable("chats", {
  id: integer().primaryKey(),
  title: text().notNull(),
});

export const chatMessages = sqliteTable("chat_messages", {
  id: integer().primaryKey(),
  chatId: integer()
    .notNull()
    .references(() => chats.id, { onDelete: "cascade" }),
  message: text({ mode: "json" }).notNull(),
});

export const categoryOrder = sqliteTable(
  "category_order",
  {
    userId: integer()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    categoryId: integer()
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    sort: integer().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.categoryId] })],
);
