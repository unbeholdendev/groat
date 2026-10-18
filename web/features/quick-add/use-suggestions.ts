import { z } from "zod";
import { formatAmount } from "../../../shared/amount";
import type { parse } from "../../../shared/parse";
import { useApi } from "../../lib/api";
import { type Suggestion, suggestion } from "../../lib/schemas";

export function useSuggestions(p: ReturnType<typeof parse>, text: string, lastCurrency: string) {
  const guesses = useApi(z.array(suggestion), ["/api/notes?prefix=", encodeURIComponent(p.note)], { enabled: p.note.length > 1 }).data ?? [];
  const line = (s: Suggestion) =>
    s.currency === "BTC" ? `${s.note} ${s.amount} sats ` : `${s.note} ${formatAmount(s.amount, s.currency)}${s.currency === lastCurrency ? "" : ` ${s.currency.toLowerCase()}`} `;
  const fills = p.note.length > 1 && !p.amount && !p.currency && !p.tags.length ? guesses.slice(0, 3) : [];
  const ghost = fills[0] && line(fills[0]).toLowerCase().startsWith(text.toLowerCase()) ? line(fills[0]).slice(text.length) : "";
  return { guess: p.note.length > 1 ? guesses[0] : undefined, fills, ghost, line };
}
