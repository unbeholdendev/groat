import { desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../../db";
import { chatMessages, chats } from "../../schema";
import { chatMessage } from "./message";

export const saveMessage = (db: Db, chatId: number, message: object) =>
  db.insert(chatMessages).values({ chatId, message }).run();

export function findChat(db: Db, id: number | string) {
  const row = db
    .select()
    .from(chats)
    .where(eq(chats.id, Number(id)))
    .get();
  if (!row) return null;
  const messages = db.select().from(chatMessages).where(eq(chatMessages.chatId, row.id)).orderBy(chatMessages.id).all();
  return { row, messages: messages.map((m) => chatMessage.parse(m.message)) };
}

export const listChats = (db: Db) => db.select().from(chats).orderBy(desc(chats.id)).all();

export const createChat = (db: Db, title: string) => db.insert(chats).values({ title }).returning().get().id;

export const deleteChat = (db: Db, id: number) => db.delete(chats).where(eq(chats.id, id)).returning().get();

export function closeInterrupted(db: Db) {
  const last = db
    .select()
    .from(chatMessages)
    .where(
      inArray(
        chatMessages.id,
        db
          .select({ id: sql`max(${chatMessages.id})` })
          .from(chatMessages)
          .groupBy(chatMessages.chatId),
      ),
    )
    .all();
  for (const { chatId, message } of last) {
    const { role, tool_calls } = chatMessage.parse(message);
    if (role !== "assistant" || tool_calls?.length)
      saveMessage(db, chatId, {
        role: "assistant",
        content: "Interrupted by a server restart. Check the steps above before asking again.",
      });
  }
}
