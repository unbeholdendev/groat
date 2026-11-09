import { eq } from "drizzle-orm";
import { knownCurrencies, parseAmount } from "../shared/amount";
import { transactionInput, type Kind } from "../shared/schema";
import type { Ctx } from "./app";
import { builtin, settings, today } from "./db";
import { valid } from "./request";
import { categories } from "./schema";

export type Intent =
  | { intent: "add" }
  | { intent: "edit"; old: { currency: string; categoryId: number | null } }
  | { intent: "chat" }
  | { intent: "extract" }
  | { intent: "capture"; pending: boolean }
  | { intent: "import"; kind: Kind };

export function readTransaction({ db, clock }: Pick<Ctx, "db" | "clock">, raw: unknown, intent: Intent) {
  const parsed = valid(transactionInput, raw);
  if ("error" in parsed) return parsed;
  const day = today(clock);
  const fallback = intent.intent === "edit" ? intent.old.currency : intent.intent === "import" ? settings(db).baseCurrency : settings(db).lastCurrency;
  const { note, currency = fallback, date = day, tags = [], unit } = parsed.data;
  if (currency !== fallback && !knownCurrencies.has(currency)) return { error: "Invalid currency" };
  const pending = intent.intent === "extract" || (intent.intent === "capture" && intent.pending);
  const amount = pending && parsed.data.amount === "0" ? 0 : parseAmount(parsed.data.amount, currency, unit);
  if (amount === null) return { error: "Invalid amount" };
  // today is UTC; the user's local date can be a day ahead
  if (date > new Date(Date.parse(day) + 864e5).toISOString().slice(0, 10)) return { error: "Date can’t be in the future" };
  const kindOf = (id: number) => db.select({ kind: categories.kind }).from(categories).where(eq(categories.id, id)).get()?.kind;
  const chosen = parsed.data.categoryId;
  const picked = intent.intent === "extract" && chosen !== undefined && kindOf(chosen) !== "expense" ? undefined : chosen;
  const categoryId = picked ?? (intent.intent === "edit" ? intent.old.categoryId : null) ?? builtin(db, intent.intent === "import" ? intent.kind : "expense");
  const kind = kindOf(categoryId);
  if (!kind) return { error: "Invalid category" };
  if (intent.intent === "chat" && kind !== "expense") return { error: "Drafts are expenses only; pick an expense category" };
  return { note, amount, currency, date, categoryId, tags: [...new Set(tags)] };
}

export type TransactionFields = Exclude<ReturnType<typeof readTransaction>, { error: string }>;
