import { type Context, Hono } from "hono";
import { desc, eq, sql } from "drizzle-orm";
import { type Ctx, type Deps, expenseFilter, expenses, json, newest, readExpense } from "./app";
import { countable, settings, today, uncategorised } from "./db";
import type { Valuer } from "./rates";
import { categories, chatMessages, chats as chatTable } from "./schema";
import { period } from "./stats";

type Message = { role: string; content: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[] };

export const aiEnabled = ({ aiApiKey, aiBaseUrl, aiModel }: Deps["config"]) => !!(aiApiKey && aiBaseUrl && aiModel);

export function chats({ db, clock, fetch, config }: Ctx, value: Valuer) {
  const app = new Hono();
  app.use("*", async (c, next) => (aiEnabled(config) ? next() : c.json({ error: "AI is not configured" }, 403)));

  const save = (chatId: number, message: object) => db.insert(chatMessages).values({ chatId, message }).run();

  const chat = (id: number | string) => {
    const row = db.select().from(chatTable).where(eq(chatTable.id, Number(id))).get();
    if (!row) return null;
    const messages = db.select().from(chatMessages).where(eq(chatMessages.chatId, row.id)).orderBy(chatMessages.id).all();
    return { ...row, messages: messages.map((m) => m.message as Message) };
  };

  const range = { from: { type: "string", description: "YYYY-MM-DD" }, to: { type: "string", description: "YYYY-MM-DD" } };
  const totals = async ({ from, to }: { from: string; to: string }) => {
    const { categories, buckets, ...rest } = await period(db, value, from, to, "month");
    return { ...rest, categories };
  };

  const tools: Record<string, { description: string; parameters: object; run: (args: any) => unknown }> = {
    category_totals: {
      description: "Spend per category (with subcategories) for a date range, in base currency.",
      parameters: { type: "object", properties: range, required: ["from", "to"] },
      run: totals,
    },
    list_expenses: {
      description: "Expenses newest first (max 200), each with baseAmount in base currency. All filters optional.",
      parameters: {
        type: "object",
        properties: {
          ...range,
          category: { type: "integer", description: "category id; includes its subcategories" },
          tag: { type: "string" },
          currency: { type: "string" },
          q: { type: "string", description: "text the note contains" },
        },
      },
      run: async (args) => value(expenses(db, expenseFilter(db, args, countable)).orderBy(...newest).limit(200).all()),
    },
    compare_periods: {
      description: "Spend per category for two date ranges, in base currency.",
      parameters: {
        type: "object",
        properties: Object.fromEntries(["first", "second"].map((k) => [k, { type: "object", properties: range, required: ["from", "to"] }])),
        required: ["first", "second"],
      },
      run: async ({ first, second }) => ({ first: await totals(first), second: await totals(second) }),
    },
    sql: {
      description: [
        "Run one read-only SQLite query for questions the other tools cannot answer. Max 200 rows, 2 second timeout.",
        "Binned and pending expenses are included: add `deleted_at IS NULL AND status = 'normal'` on expenses unless asked otherwise.",
        `Schema:\n${db
          .all<{ sql: string }>(sql`SELECT sql FROM sqlite_schema WHERE type = 'table' AND name != '__drizzle_migrations'`)
          .map((t) => t.sql)
          .join(";\n")}`,
      ].join("\n"),
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
      run: async ({ query }) => {
        const child = Bun.spawn([process.execPath, `${import.meta.dir}/sql.ts`, query, "200"], { stdin: db.$client.serialize(), timeout: 2000 });
        const out = await new Response(child.stdout).text();
        return (await child.exited) === 0 ? JSON.parse(out) : { error: "query timed out" };
      },
    },
    draft_expense: {
      description:
        "Draft an expense the user describes, for them to review and save. Saves nothing. Resolve relative dates against today. Amount is a decimal string in major units.",
      parameters: {
        type: "object",
        properties: {
          note: { type: "string" },
          amount: { type: "string", description: "e.g. 12.50" },
          currency: { type: "string", description: "an enabled currency; defaults to base" },
          date: { type: "string", description: "YYYY-MM-DD; defaults to today" },
          categoryId: { type: "integer" },
          tags: { type: "array", items: { type: "string" } },
        },
        required: ["note", "amount"],
      },
      run: (args) => {
        const { baseCurrency, currencies } = settings(db);
        const draft = readExpense(args, db, today(clock), baseCurrency, currencies, uncategorised(db));
        if ("error" in draft) throw new Error(draft.error);
        return { draft };
      },
    },
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

  const complete = async (messages: Message[]) => {
    const res = await fetch(`${config.aiBaseUrl}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${config.aiApiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: config.aiModel,
        messages: [{ role: "system", content: system() }, ...messages],
        tools: Object.entries(tools).map(([name, { description, parameters }]) => ({ type: "function", function: { name, description, parameters } })),
      }),
    });
    if (!res.ok) throw new Error(`AI provider returned ${res.status}`);
    return ((await res.json()) as { choices: { message: Message }[] }).choices[0].message;
  };

  const question = async (c: Context) => {
    const { message } = await json(c);
    return typeof message === "string" && message.trim() ? message.trim() : null;
  };

  const ask = async (chatId: number | null, message: string) => {
    const history = chatId ? chat(chatId)!.messages : [];
    const added: Message[] = [{ role: "user", content: message }];
    for (let turn = 0; turn < 10; turn++) {
      const reply = await complete([...history, ...added]);
      added.push(reply);
      if (!reply.tool_calls?.length) break;
      for (const { id: callId, function: f } of reply.tool_calls) {
        const result = await Promise.resolve()
          .then(() => tools[f.name].run(JSON.parse(f.arguments)))
          .catch((e) => ({ error: String(e) }));
        added.push({ role: "tool", tool_call_id: callId, content: JSON.stringify(result) } as Message);
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
    const message = await question(c);
    if (!message) return c.json({ error: "message is required" }, 400);
    return c.json(await ask(null, message), 201);
  });

  app.get("/:id", (c) => {
    const found = chat(c.req.param("id"));
    return found ? c.json(found) : c.json({ error: "not found" }, 404);
  });

  app.post("/:id/messages", async (c) => {
    const message = await question(c);
    if (!chat(c.req.param("id"))) return c.json({ error: "not found" }, 404);
    if (!message) return c.json({ error: "message is required" }, 400);
    return c.json(await ask(Number(c.req.param("id")), message));
  });

  app.delete("/:id", (c) =>
    db.delete(chatTable).where(eq(chatTable.id, Number(c.req.param("id")))).returning().get() ? c.json({}) : c.json({ error: "not found" }, 404),
  );

  return app;
}
