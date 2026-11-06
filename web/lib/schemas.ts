import { z } from "zod";
import { parseAmount } from "../../shared/amount";
import { kind, transactionInput } from "../../shared/schema";

export const transaction = z.object({
  id: z.number(),
  note: z.string(),
  amount: z.number(),
  currency: z.string(),
  date: z.string(),
  categoryId: z.number().nullable(),
  tags: z.array(z.string()),
  baseAmount: z.number().nullish(),
  status: z.enum(["normal", "pending"]).optional(),
  recurringId: z.number().nullish(),
  addedBy: z.string().nullish(),
  attachmentId: z.number().nullish(),
});
export type Transaction = z.infer<typeof transaction>;

export const category = z.object({ id: z.number(), name: z.string(), icon: z.string(), color: z.string(), parentId: z.number().nullable(), builtin: z.boolean(), kind });
export type Category = z.infer<typeof category>;

export const theme = z.enum(["system", "light", "dark"]);
export const settings = z.object({
  baseCurrency: z.string(),
  recentCurrencies: z.array(z.string()),
  lastCurrency: z.string(),
  theme,
  onboarded: z.boolean(),
  ai: z.boolean(),
  vision: z.boolean(),
  voice: z.boolean(),
  income: z.boolean(),
});
export type Settings = z.infer<typeof settings>;

const role = z.enum(["admin", "member"]);
export const session = z.object({ setup: z.boolean(), user: z.object({ username: z.string(), role }).nullable() });
export const member = z.object({ id: z.number(), username: z.string(), role });

export const draft = z.object({ note: z.string(), amount: z.number(), currency: z.string(), date: z.string(), categoryId: z.number().nullable(), tags: z.array(z.string()), attachmentId: z.number().nullish() });
export type Draft = z.infer<typeof draft>;
const drafted = z.object({ draft });

export function draftIn(content: string | null | undefined) {
  try {
    return drafted.parse(JSON.parse(content ?? "")).draft;
  } catch {
    return undefined;
  }
}

export const chat = z.object({ id: z.number(), title: z.string(), messages: z.array(z.object({ role: z.string(), content: z.string().nullish() })).optional() });
export type Chat = z.infer<typeof chat>;

export const tag = z.object({ id: z.number(), name: z.string() });

export const apiToken = z.object({ id: z.number(), name: z.string(), createdAt: z.string(), lastUsedAt: z.string().nullable() });
export type ApiToken = z.infer<typeof apiToken>;

export const template = transaction.omit({ date: true }).extend({
  period: z.string(),
  every: z.number(),
  startDate: z.string(),
  endDate: z.string().nullable(),
  needsConfirmation: z.boolean(),
  paused: z.boolean(),
});
export type Template = z.infer<typeof template>;

export const suggestion = z.object({ note: z.string(), categoryId: z.number().nullable(), currency: z.string(), amount: z.number() });
export type Suggestion = z.infer<typeof suggestion>;

const slice = z.object({ id: z.number(), name: z.string(), icon: z.string(), color: z.string(), total: z.number() });
const breakdown = z.array(slice.extend({ children: z.array(slice) }));
export const period = z.object({
  baseCurrency: z.string(),
  total: z.number(),
  unconverted: z.number(),
  categories: breakdown,
  income: z.object({ total: z.number(), categories: breakdown }),
  tags: z.array(z.object({ name: z.string(), total: z.number() })),
  buckets: z.array(z.object({ start: z.string(), total: z.number() })),
});

export function unsent(body: unknown, id: number): Transaction | undefined {
  const sent = transactionInput.safeParse(body).data;
  if (!sent) return undefined;
  const { note, currency = "", date = "", categoryId = null, tags = [] } = sent;
  return { id, note, currency, date, categoryId, tags, amount: parseAmount(sent.amount, currency, sent.unit) || 0 };
}

export const request = z.tuple([z.string(), z.string()], z.unknown());
export type Request = [method: string, path: string, body?: unknown];
