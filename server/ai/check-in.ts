import { and, desc, eq, inArray, min } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../auth/access";
import type { Ctx } from "../context";
import { errorKind, log } from "../logging";
import { fail } from "../request";
import * as schema from "../schema";
import { chatMessage, type Message } from "./chat/message";
import { createChat, saveMessage } from "./chat/store";
import { callTool, readTools, systemPrompt, toolSpecs } from "./chat/tools";

const week = 7 * 86_400_000;
const quiet = "NOTHING";

const instructions = (earlier: string[]) =>
  [
    "This is the weekly check-in. Nobody asked a question: look through recent spending with the tools and report only what is notable for the household, briefly.",
    "Look for: notes that repeat on a regular interval but are not recurring expenses; price creep on repeated notes (e.g. coffee 3.20 → 4.10 since March); categories well above their usual level; recurring expenses that changed or stopped; likely duplicates (same note and amount within a day or two); pending expenses left unconfirmed for days; income that is late, smaller than usual or missing, if income is tracked.",
    "These are starting points, not a checklist. Use your own judgement too: a trend, a habit forming or fading, a good week worth noting, or anything a thoughtful friend looking at these accounts would mention. Leave out what the household would shrug at.",
    "Cite the transactions behind each finding with internal links.",
    `If nothing is notable, or everything was already reported below, reply with exactly ${quiet}.`,
    earlier.length
      ? `Earlier check-in reports, newest first; do not repeat them:\n${earlier.join("\n---\n")}`
      : "There are no earlier check-in reports.",
  ].join("\n");

export type CheckIns = ReturnType<typeof checkIns>;

export function checkIns(ctx: Ctx) {
  const { db, ai, clock } = ctx;
  const { draft_transaction, ...tools } = readTools(ctx);
  const saved = () => db.select().from(schema.settings).get();
  let running: Promise<number | null> | null = null;

  const earlier = () =>
    db
      .select({ title: schema.chats.title, message: schema.chatMessages.message })
      .from(schema.chats)
      .innerJoin(schema.chatMessages, eq(schema.chatMessages.chatId, schema.chats.id))
      .where(
        and(
          eq(schema.chats.checkIn, true),
          inArray(
            schema.chatMessages.id,
            db
              .select({ id: min(schema.chatMessages.id) })
              .from(schema.chatMessages)
              .groupBy(schema.chatMessages.chatId),
          ),
        ),
      )
      .orderBy(desc(schema.chats.id))
      .limit(4)
      .all()
      .map(({ title, message }) => `${title}: ${chatMessage.parse(message).content}`);

  const report = async () => {
    const messages: Message[] = [
      { role: "system", content: `${systemPrompt(ctx)}\n${instructions(earlier())}` },
      { role: "user", content: "Run this week's check-in." },
    ];
    for (let turn = 0; turn < 25; turn++) {
      const reply = await ai.complete({
        messages,
        tools: toolSpecs(tools),
      });
      messages.push(reply);
      if (!reply.tool_calls?.length) return reply.content?.trim() ?? "";
      for (const { id, function: f } of reply.tool_calls) {
        const result = await callTool(tools, f);
        messages.push({ role: "tool", tool_call_id: id, content: JSON.stringify(result) });
      }
    }
    fail(502, "The check-in reached the tool limit");
  };

  const post = (content: string) => {
    if (!content || content === quiet) return null;
    const title = `Check-in ${clock().toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}`;
    const id = db.transaction(() => {
      const id = createChat(db, title, { checkIn: true, unread: true });
      saveMessage(db, id, { role: "assistant", content });
      return id;
    });
    ctx.broadcast({ type: "changed", resources: ["chats"] });
    return id;
  };

  const run = () =>
    (running ??= report()
      .then((content) => {
        const id = post(content);
        db.update(schema.settings).set({ lastCheckInAt: clock().toISOString() }).run();
        ctx.broadcast({ type: "changed", resources: ["settings"] });
        return id;
      })
      .finally(() => {
        running = null;
      }));

  const due = () => {
    const s = saved();
    return !!s?.checkIns && (!s.lastCheckInAt || clock().getTime() - Date.parse(s.lastCheckInAt) >= week);
  };

  const tick = async () => {
    try {
      if (due() && !(await ai.unavailable("chat"))) await run();
    } catch (error) {
      log("warn", "ai.check_in.failed", { error: errorKind(error) });
    }
  };

  return { run, tick };
}

export function checkInRoutes({ ai }: Pick<Ctx, "ai">, { run }: Pick<CheckIns, "run">) {
  const app = new Hono<Env>();
  app.post("/api/check-in", async (c) => {
    const off = await ai.unavailable("chat");
    if (off) return c.json({ error: off }, 403);
    const id = await run().catch((error) => {
      log("warn", "ai.check_in.failed", { error: errorKind(error) });
      if (error instanceof HTTPException) throw error;
      fail(502, "The AI provider sent an unexpected reply");
    });
    return c.json({ id });
  });
  return app;
}
