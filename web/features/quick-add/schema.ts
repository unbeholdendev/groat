import { z } from "zod";
import { formatAmount, parseAmount, type Unit } from "../../../shared/amount";
import type { Draft } from "../../lib/schemas";

export const review = (unit: Unit) =>
  z
    .object({
      note: z.string().trim().min(1, "Enter a note"),
      amount: z.string(),
      currency: z.string(),
      date: z.string(),
      categoryId: z.number().transform((n) => n || undefined),
      tags: z.string(),
    })
    .refine((f) => parseAmount(f.amount, f.currency, unit) !== null, { path: ["amount"], message: "Enter an amount" })
    .transform((f) => ({
      ...f,
      unit,
      tags: f.tags
        .split(/\s+/)
        .map((t) => t.replace(/^#/, ""))
        .filter(Boolean),
    }));

export type Fields = z.input<ReturnType<typeof review>>;

export const fields = (d: Draft, unit: Unit): Fields => ({
  note: d.note,
  amount: d.amount ? formatAmount(d.amount, d.currency, unit) : "",
  currency: d.currency,
  date: d.date,
  categoryId: d.categoryId ?? 0,
  tags: d.tags.map((t) => `#${t}`).join(" "),
});
