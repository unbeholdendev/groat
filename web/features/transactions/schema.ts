import type { UseFormReturn } from "react-hook-form";
import { z } from "zod";
import { formatAmount, parseAmount, type Unit } from "../../../shared/amount";
import { today } from "../../lib/dates";
import type { Draft, Template } from "../../lib/schemas";

export const transactionForm = (unit: Unit) =>
  z
    .object({
      note: z.string(),
      amount: z.string(),
      currency: z.string(),
      date: z.string(),
      categoryId: z.number().nullable(),
      tags: z.string().transform((s) => s.split(",").map((t) => t.trim()).filter(Boolean)),
      period: z.string(),
      every: z.string(),
      endDate: z.string(),
      needsConfirmation: z.boolean(),
    })
    .superRefine((v, ctx) => {
      const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
      if (!v.note.trim()) issue("note", "Enter a note");
      if (parseAmount(v.amount, v.currency, unit) === null) issue("amount", "Enter an amount");
      if (!v.period) return;
      if (!/^\d+$/.test(v.every.trim()) || Number(v.every) < 1) issue("every", "Enter 1 or more");
      if (v.endDate && v.endDate < v.date) issue("endDate", "End on or after the start");
    });

type Schema = ReturnType<typeof transactionForm>;
export type TransactionValues = z.input<Schema>;
export type TransactionFormApi = UseFormReturn<TransactionValues, unknown, z.output<Schema>>;

const noRepeat = { period: "", every: "1", endDate: "", needsConfirmation: false };

export const blank = (currency: string): TransactionValues => ({ note: "", amount: "", currency, date: today(), categoryId: null, tags: "", ...noRepeat });

export const filled = (e: Draft, unit: Unit): TransactionValues => ({
  note: e.note,
  amount: e.amount ? formatAmount(e.amount, e.currency, unit) : "",
  currency: e.currency,
  date: e.date,
  categoryId: e.categoryId || null,
  tags: e.tags.join(", "),
  ...noRepeat,
});

export const fromTemplate = (t: Template, unit: Unit): TransactionValues => ({
  ...filled({ ...t, date: t.startDate }, unit),
  period: t.period,
  every: String(t.every),
  endDate: t.endDate ?? "",
  needsConfirmation: t.needsConfirmation,
});
