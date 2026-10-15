import { z } from "zod";

export const isoDate = z
  .string()
  .refine((s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(Date.parse(s) || 0).toISOString().slice(0, 10) === s, "invalid date");

export const unit = z.enum(["sats", "BTC"]);

export const expenseInput = z.object({
  note: z.string("note is required").trim().min(1, "note is required"),
  amount: z.string("invalid amount"),
  currency: z.string("currency not enabled").optional(),
  unit: unit.optional(),
  date: isoDate.optional(),
  categoryId: z.number("invalid category").int("invalid category").optional(),
  tags: z.array(z.string("invalid tags").trim().min(1, "invalid tags"), "invalid tags").optional(),
});
export type ExpenseInput = z.infer<typeof expenseInput>;
