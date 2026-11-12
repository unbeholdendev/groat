import { z } from "zod";

export const isoDate = z
  .string()
  .refine(
    (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(Date.parse(s) || 0).toISOString().slice(0, 10) === s,
    "Invalid date",
  );

export const kinds = ["expense", "income"] as const;
export const kind = z.enum(kinds, "Invalid kind");
export type Kind = z.infer<typeof kind>;

export const unit = z.enum(["sats", "BTC"]);

export const resource = z.enum([
  "transactions",
  "categories",
  "settings",
  "recurring",
  "members",
  "tokens",
  "ai",
  "session",
  "chats",
]);
export type Resource = z.infer<typeof resource>;

export const transactionInput = z.object({
  note: z.string("Enter a note").trim().min(1, "Enter a note"),
  amount: z.string("Invalid amount"),
  currency: z.string("Invalid currency").optional(),
  unit: unit.optional(),
  date: isoDate.optional(),
  categoryId: z.number("Invalid category").int("Invalid category").optional(),
  tags: z.array(z.string("Invalid tags").trim().min(1, "Invalid tags"), "Invalid tags").optional(),
});
export type TransactionInput = z.infer<typeof transactionInput>;
