import { formatAmount } from "../../shared/amount";
import { kind, type Kind } from "../../shared/schema";
import type { Ctx } from "../context";
import * as schema from "../schema";
import { parseCsv } from "./csv";
import { readTransaction } from "./read-transaction";

const required = ["date", "note", "amount", "currency"];

const trimZeros = (amount: string) => (amount.includes(".") ? amount.replace(/0+$/, "").replace(/\.$/, "") : amount);
export const key = (...names: string[]) => names.map((n) => n.toLowerCase()).join("\n");

export function plan(ctx: Pick<Ctx, "db" | "clock">, text: string) {
  const { db } = ctx;
  const csv = parseCsv(text.replace(/^﻿/, ""));
  if (csv.error !== undefined) return { error: csv.error };
  const [header, ...lines] = csv.rows;
  const column = new Map((header?.cells ?? []).map((name, i) => [name.trim().toLowerCase(), i]));
  if (required.some((name) => !column.has(name)))
    return { error: "The file needs date, note, amount and currency columns" };

  const existing = new Map<string, number>();
  const kinds = new Map<string, Kind>();
  const all = db
    .select({
      id: schema.categories.id,
      name: schema.categories.name,
      parentId: schema.categories.parentId,
      kind: schema.categories.kind,
    })
    .from(schema.categories)
    .all();
  for (const c of all) {
    const parent = all.find((p) => p.id === c.parentId);
    existing.set(parent ? key(parent.name, c.name) : key(c.name), c.id);
    if (!parent) kinds.set(key(c.name), c.kind);
  }
  const created = new Map<string, [string, string?]>();
  const rows = [];
  const rejected = [];
  for (const { line, cells } of lines) {
    if (cells.every((cell) => !cell.trim())) continue;
    const cell = (name: string) => cells[column.get(name) ?? -1]?.trim() ?? "";
    const tags = cell("tags")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    const input = {
      note: cell("note"),
      amount: trimZeros(cell("amount")),
      currency: cell("currency"),
      date: cell("date"),
      tags,
    };
    const [category, sub] = [cell("category"), cell("subcategory")];
    const type = kind.optional().safeParse(cell("type").toLowerCase() || undefined);
    const rowKind = (type.success && type.data) || (category && kinds.get(key(category))) || "expense";
    const problem = () => {
      if (!input.date) return "Invalid date";
      if (!input.currency) return "Invalid currency";
      if (!type.success) return "Invalid type";
      if (category && rowKind !== (kinds.get(key(category)) ?? rowKind))
        return `${category} isn’t an ${rowKind} category`;
    };
    const error = problem();
    const read = error ? { error } : readTransaction(ctx, input, { intent: "import", kind: rowKind });
    if ("error" in read) {
      rejected.push({ line, error: read.error });
      continue;
    }
    if (category && !kinds.has(key(category))) kinds.set(key(category), rowKind);
    if (category && !existing.has(key(category)) && !created.has(key(category))) created.set(key(category), [category]);
    if (category && sub && !existing.has(key(category, sub)) && !created.has(key(category, sub)))
      created.set(key(category, sub), [category, sub]);
    const path = sub ? key(category, sub) : key(category);
    rows.push({ ...read, at: category ? path : undefined });
  }

  const totals = new Map<string, number>();
  for (const r of rows) totals.set(r.currency, (totals.get(r.currency) ?? 0) + r.amount);
  return {
    rows,
    created,
    existing,
    kinds,
    preview: {
      count: rows.length,
      totals: [...totals]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([currency, amount]) => ({ currency, amount: formatAmount(amount, currency) })),
      categories: [...created.values()].map((path) => path.join(" › ")),
      rejected,
    },
  };
}
