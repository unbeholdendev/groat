import { eq } from "drizzle-orm";
import { z } from "zod";
import { knownCurrencies } from "../../shared/amount";
import { parse } from "../../shared/parse";
import { isoDate } from "../../shared/schema";
import { type Ctx, today } from "../context";
import { fail } from "../request";
import { settings } from "../settings/queries";
import { readTransaction } from "../transactions/read-transaction";
import { categories } from "../schema";

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

type Photo = { image: string };

export async function extract(ctx: Pick<Ctx, "db" | "clock" | "ai">, input: string | Photo) {
  const { db, clock } = ctx;
  const text = typeof input === "string" ? input : "";
  const { recentCurrencies } = settings(db);
  const day = today(clock);
  const cats = db
    .select({ id: categories.id, name: categories.name, parentId: categories.parentId })
    .from(categories)
    .where(eq(categories.kind, "expense"))
    .all();
  const message = await ctx.ai.complete(
    {
      messages: [
        {
          role: "system",
          content: [
            "Read one expense from the user's text, or from a receipt photo: its total, with the merchant as the note.",
            `Today is ${day}. Recent currencies: ${recentCurrencies.join(", ")}.`,
            `Categories: ${JSON.stringify(cats)}`,
          ].join("\n"),
        },
        {
          role: "user",
          content: typeof input === "string" ? input : [{ type: "image_url", image_url: { url: input.image } }],
        },
      ],
      tools: [
        {
          type: "function",
          function: { name: "transaction", parameters: z.toJSONSchema(fields, { io: "input", target: "draft-07" }) },
        },
      ],
      tool_choice: { type: "function", function: { name: "transaction" } },
    },
    typeof input === "string" ? "chat" : "vision",
  );
  const read = reply.safeParse(message.tool_calls?.[0]?.function.arguments);
  if (!read.success) fail(502, "The AI provider sent an unexpected reply");
  const { note, amount, currency, date, categoryId, tags = [] } = read.data;
  const code = currency?.toUpperCase();
  const draft = readTransaction(
    ctx,
    {
      note: note.trim() || text || "Receipt",
      amount: amount ?? "0",
      currency: code && knownCurrencies.has(code) ? code : undefined,
      date: isoDate.safeParse(date).success && date && date <= day ? date : undefined,
      categoryId,
      tags: [...parse(text, recentCurrencies).tags, ...tags],
    },
    { intent: "extract" },
  );
  if ("error" in draft) fail(502, "The AI provider sent an unexpected reply");
  return draft;
}
