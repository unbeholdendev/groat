import { Hono } from "hono";
import { z } from "zod";
import { parse } from "../shared/parse";
import { isoDate } from "../shared/schema";
import { aiEnabled, complete } from "./ai";
import type { Ctx } from "./app";
import { settings, today, uncategorised } from "./db";
import { readExpense } from "./expenses";
import { body } from "./request";
import { categories } from "./schema";

const fields = z.object({
  note: z.string().describe("short description, without the amount, currency or tags"),
  amount: z.string().optional().describe("decimal in major units, e.g. 12.50; omit if the text has none"),
  currency: z.string().optional().describe("ISO code, only if the text names one"),
  date: z.string().optional().describe("YYYY-MM-DD, only if the text gives a day"),
  categoryId: z.number().optional().describe("id from the category list; omit if none fits"),
  tags: z.array(z.string()).optional(),
});

const reply = z.string().transform((s, ctx) => {
  try {
    return fields.parse(JSON.parse(s));
  } catch {
    ctx.addIssue({ code: "custom", message: "unexpected reply" });
    return z.NEVER;
  }
});

export const textInput = z.object({ text: z.string("Enter some text").trim().min(1, "Enter some text") });

type Photo = { image: string; model: string };

export async function extract(ctx: Ctx, input: string | Photo) {
  const { db, clock } = ctx;
  const text = typeof input === "string" ? input : "";
  const { lastCurrency, currencies } = settings(db);
  const day = today(clock);
  const cats = db.select({ id: categories.id, name: categories.name, parentId: categories.parentId }).from(categories).all();
  const message = await complete(ctx, {
    messages: [
      {
        role: "system",
        content: [
          "Read one expense from the user's text, or from a receipt photo: its total, with the merchant as the note.",
          `Today is ${day}. Enabled currencies: ${currencies.join(", ")}.`,
          `Categories: ${JSON.stringify(cats)}`,
        ].join("\n"),
      },
      { role: "user", content: typeof input === "string" ? input : [{ type: "image_url", image_url: { url: input.image } }] },
    ],
    tools: [{ type: "function", function: { name: "expense", parameters: z.toJSONSchema(fields, { io: "input", target: "openapi-3.0" }) } }],
    tool_choice: { type: "function", function: { name: "expense" } },
    ...(typeof input === "string" ? {} : { model: input.model }),
  });
  const read = reply.safeParse(message.tool_calls?.[0]?.function.arguments);
  if (!read.success) throw new Error("The AI provider sent an unexpected reply");
  const { note, amount, currency, date, categoryId, tags = [] } = read.data;
  const code = currency?.toUpperCase();
  const draft = readExpense(
    {
      note: note.trim() || text || "Receipt",
      amount: amount ?? "0",
      currency: code && currencies.includes(code) ? code : undefined,
      date: isoDate.safeParse(date).success && date && date <= day ? date : undefined,
      categoryId: cats.some((c) => c.id === categoryId) ? categoryId : undefined,
      tags: [...parse(text, currencies).tags, ...tags],
    },
    db,
    day,
    lastCurrency,
    currencies,
    uncategorised(db),
    true,
  );
  if ("error" in draft) throw new Error("The AI provider sent an unexpected reply");
  return draft;
}

export function draftRoutes(ctx: Ctx) {
  const app = new Hono();

  app.post("/api/drafts", async (c) => {
    if (!aiEnabled(ctx.config)) return c.json({ error: "AI isn’t set up" }, 403);
    const parsed = await body(c, textInput);
    if ("error" in parsed) return c.json(parsed, 400);
    return c.json(await extract(ctx, parsed.data.text));
  });

  app.onError((e, c) => c.json({ error: e.message }, 502));

  return app;
}
