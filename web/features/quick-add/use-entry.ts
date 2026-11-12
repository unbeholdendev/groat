import { useState } from "react";
import { parseAmount, type Unit } from "../../../shared/amount";
import { parse } from "../../../shared/parse";
import { today } from "../../lib/dates";
import type { Category, Draft, Settings } from "../../lib/schemas";
import { useSuggestions } from "./use-suggestions";

export function useEntry(settings: Settings, categories: Category[], unit: Unit, inChat: boolean) {
  const [text, setText] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [date, setDate] = useState(today);
  const ask = inChat || (settings.ai && text.startsWith("?"));
  const p = parse(ask ? "" : text, settings.recentCurrencies);
  const { guess, fills, ghost, line } = useSuggestions(p, text, settings.lastCurrency);
  const category = categories.find((c) => c.id === (categoryId ?? guess?.categoryId));
  const currency = p.currency ?? guess?.currency ?? settings.lastCurrency;
  const seed = (): Draft => ({
    note: p.note,
    amount: (p.amount && parseAmount(p.amount, currency, p.unit ?? unit)) || 0,
    currency,
    date,
    categoryId: category?.id ?? 0,
    tags: p.tags,
  });
  function reset() {
    setText("");
    setCategoryId(null);
    setDate(today());
  }
  return {
    text,
    setText,
    ask,
    question: text.replace(/^\?/, "").trim(),
    p,
    fills,
    ghost,
    line,
    category,
    setCategoryId,
    currency,
    date,
    setDate,
    seed,
    reset,
  };
}

export type Entry = ReturnType<typeof useEntry>;

export type Mode = "chat" | "asking" | "reviewing" | "typing" | "idle";

export function modeOf(entry: Entry, inChat: boolean, reviewing: boolean): Mode {
  if (inChat) return "chat";
  if (entry.ask) return "asking";
  if (reviewing) return "reviewing";
  return entry.text ? "typing" : "idle";
}
