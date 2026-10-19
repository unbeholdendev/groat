import { Hono } from "hono";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { expenseInput, isoDate } from "../shared/schema";
import type { Ctx, Deps } from "./app";
import { countable, settings, today, uncategorised } from "./db";
import { expenseFilter, expenseQuery, expenses, newest, readExpense } from "./expenses";
import { body } from "./request";
import type { Valuer } from "./rates";
import { categories, chatMessages, chats as chatTable } from "./schema";
import { period } from "./stats";

const chatMessage = z.looseObject({
  role: z.string(),
  content: z.string().nullish(),
  tool_calls: z.array(z.looseObject({ id: z.string(), function: z.looseObject({ name: z.string(), arguments: z.string() }) })).optional(),
  tool_call_id: z.string().optional(),
});
type Message = z.infer<typeof chatMessage>;
const completion = z.object({ choices: z.tuple([z.object({ message: chatMessage })], z.unknown()) });
const question = z.object({ message: z.string("Enter a message").trim().min(1, "Enter a message") });
const range = z.object({ from: isoDate.describe("YYYY-MM-DD"), to: isoDate.describe("YYYY-MM-DD") });

const tool = <T extends z.ZodType>(description: string, input: T, run: (args: z.output<T>) => unknown) => ({
  description,
  parameters: z.toJSONSchema(input, { io: "input", target: "openapi-3.0" }),
  run: (args: unknown) => run(input.parse(args)),
});

export const aiEnabled = ({ aiApiKey, aiBaseUrl, aiModel }: Deps["config"]) => !!(aiApiKey && aiBaseUrl && aiModel);

export const visionModel = (config: Deps["config"]) => (aiEnabled(config) && (config.aiVisionModel ?? config.aiModel)) || undefined;

export async function complete({ fetch, config }: Pick<Ctx, "fetch" | "config">, request: object) {
  const res = await fetch(`${config.aiBaseUrl}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${config.aiApiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model: config.aiModel, ...request }),
  });
  if (!res.ok) throw new Error(`The AI provider returned an error (${res.status})`);
  const reply = completion.safeParse(await res.json().catch(() => undefined));
  if (!reply.success) throw new Error("The AI provider sent an unexpected reply");
  return reply.data.choices[0].message;
}

export function chats({ db, clock, fetch, config }: Ctx, value: Valuer) {
  const app = new Hono();
  app.use("*", async (c, next) => (aiEnabled(config) ? next() : c.json({ error: "AI isn’t set up" }, 403)));

  const save = (chatId: number, message: object) => db.insert(chatMessages).values({ chatId, message }).run();

  const chat = (id: number | string) => {
    const row = db.select().from(chatTable).where(eq(chatTable.id, Number(id))).get();
    if (!row) return null;
    const messages = db.select().from(chatMessages).where(eq(chatMessages.chatId, row.id)).orderBy(chatMessages.id).all();
    return { ...row, messages: messages.map((m) => chatMessage.parse(m.message)) };
  };

  const totals = async ({ from, to }: z.infer<typeof range>) => {
    const { categories, buckets, ...rest } = await period(db, value, from, to, "month");
    return { ...rest, categories };
  };

  const tools: Record<string, ReturnType<typeof tool>> = {
    category_totals: tool("Spend per category (with subcategories) for a date range, in base currency.", range, totals),
    list_expenses: tool(
      "Expenses newest first (max 200), each with baseAmount in base currency. All filters optional.",
      expenseQuery.omit({ status: true }),
      async (args) => value(expenses(db, expenseFilter(db, args, countable)).orderBy(...newest).limit(200).all()),
    ),
    compare_periods: tool(
      "Spend per category for two date ranges, in base currency.",
      z.object({ first: range, second: range }),
      async ({ first, second }) => ({ first: await totals(first), second: await totals(second) }),
    ),
    sql: tool(
      [
        "Run one read-only SQLite query for questions the other tools cannot answer. Max 200 rows, 2 second timeout.",
        "Binned and pending expenses are included: add `deleted_at IS NULL AND status = 'normal'` on expenses unless asked otherwise.",
        `Schema:\n${db
          .all<{ sql: string }>(sql`SELECT sql FROM sqlite_schema WHERE type = 'table' AND name != '__drizzle_migrations'`)
          .map((t) => t.sql)
          .join(";\n")}`,
      ].join("\n"),
      z.object({ query: z.string() }),
      async ({ query }) => {
        const child = Bun.spawn([process.execPath, `${import.meta.dir}/sql.ts`, query, "200"], { stdin: db.$client.serialize(), timeout: 2000 });
        const out = await new Response(child.stdout).text();
        return (await child.exited) === 0 ? JSON.parse(out) : { error: "query timed out" };
      },
    ),
    draft_expense: tool(
      "Draft an expense the user describes, for them to review and save. Saves nothing. Resolve relative dates against today. Amount is a decimal string in major units.",
      expenseInput.omit({ unit: true }).extend({
        amount: z.string().describe("e.g. 12.50"),
        currency: z.string().optional().describe("ISO 4217 code or BTC; defaults to base"),
        date: isoDate.optional().describe("YYYY-MM-DD; defaults to today"),
      }),
      (args) => {
        const draft = readExpense(args, db, today(clock), settings(db).baseCurrency, uncategorised(db));
        if ("error" in draft) throw new Error(draft.error);
        return { draft };
      },
    ),
  };
  const system = () => {
    const cats = db.select({ id: categories.id, name: categories.name, parentId: categories.parentId }).from(categories).all();
    return [
      "You answer questions about the user's spending, and give recommendations when asked, using the tools for real data.",
      `Today is ${today(clock)}. Base currency: ${settings(db).baseCurrency}.`,
      "Binned (deleted_at set) and pending (status 'pending') expenses are not spending: leave them out unless the user asks for them.",
      "Amounts are integers in the currency's smallest unit (pence, cents, whole yen, sats for BTC).",
      `Categories: ${JSON.stringify(cats)}`,
    ].join("\n");
  };

  const ask = async (chatId: number | null, message: string) => {
    const history = (chatId && chat(chatId)?.messages) || [];
    const added: Message[] = [{ role: "user", content: message }];
    for (let turn = 0; turn < 10; turn++) {
      const reply = await complete(
        { fetch, config },
        {
          messages: [{ role: "system", content: system() }, ...history, ...added],
          tools: Object.entries(tools).map(([name, { description, parameters }]) => ({ type: "function", function: { name, description, parameters } })),
        },
      );
      added.push(reply);
      if (!reply.tool_calls?.length) break;
      for (const { id: callId, function: f } of reply.tool_calls) {
        const result = await Promise.resolve()
          .then(() => tools[f.name].run(JSON.parse(f.arguments)))
          .catch((e) => ({ error: String(e) }));
        added.push({ role: "tool", tool_call_id: callId, content: JSON.stringify(result) });
      }
    }
    return db.transaction(() => {
      const id = chatId ?? db.insert(chatTable).values({ title: message.slice(0, 60) }).returning().get().id;
      for (const m of added) save(id, m);
      return chat(id);
    });
  };

  app.onError((e, c) => c.json({ error: e.message }, 502));

  app.get("/", (c) => c.json(db.select().from(chatTable).orderBy(desc(chatTable.id)).all()));

  app.post("/", async (c) => {
    const input = await body(c, question);
    if ("error" in input) return c.json(input, 400);
    return c.json(await ask(null, input.data.message), 201);
  });

  app.get("/:id", (c) => {
    const found = chat(c.req.param("id"));
    return found ? c.json(found) : c.json({ error: "Not found" }, 404);
  });

  app.post("/:id/messages", async (c) => {
    const input = await body(c, question);
    if (!chat(c.req.param("id"))) return c.json({ error: "Not found" }, 404);
    if ("error" in input) return c.json(input, 400);
    return c.json(await ask(Number(c.req.param("id")), input.data.message));
  });

  app.delete("/:id", (c) =>
    db.delete(chatTable).where(eq(chatTable.id, Number(c.req.param("id")))).returning().get() ? c.json({}) : c.json({ error: "Not found" }, 404),
  );

  return app;
}
