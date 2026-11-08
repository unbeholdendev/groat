import { knownCurrencies, type Unit } from "./amount";

export type Part = [string, "tag" | "amount" | "currency" | ""];

export function parse(text: string, recent: string[]) {
  let amount: string | null = null;
  let currency: string | null = null;
  let unit: Unit | null = null;
  const tags: string[] = [];
  const words: string[] = [];
  const parts: Part[] = [];
  const chunks = text.split(/(\s+)/);
  const pick = chunks.find((w) => /^\d+([.,]\d+)?$/.test(w)) ?? chunks.find((w) => /^\(*\d[\d.,()]*([-+*/×÷][\d.,()]+)+$/.test(w));
  for (const w of chunks) {
    const code = w.toUpperCase();
    if (/^#\S+$/.test(w)) {
      tags.push(w.slice(1));
      parts.push([w, "tag"]);
    } else if (!amount && w === pick) {
      amount = w.replace(/,/g, ".");
      parts.push([w, "amount"]);
    } else if (!currency && (recent.includes(code) || code === "SATS" || (w === code && knownCurrencies.has(code)))) {
      currency = code === "SATS" ? "BTC" : code;
      if (code === "SATS") unit = "sats";
      parts.push([w, "currency"]);
    } else {
      if (w.trim()) words.push(w);
      parts.push([w, ""]);
    }
  }
  return { parts, amount, currency, unit, tags, note: words.join(" ") };
}

export const confident = (p: { amount: string | null }, categoryId?: number | null) => !!p.amount && categoryId != null;
