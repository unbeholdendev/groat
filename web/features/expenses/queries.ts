import { type QueryClient, useMutationState } from "@tanstack/react-query";
import { z } from "zod";
import { refresh, useApi } from "../../lib/api";
import { type Expense, expense, type Request, request, template, unsent } from "../../lib/schemas";
import { useMonth } from "./use-month";

export const useExpenses = () => useApi(z.array(expense), ["/api/expenses?", useMonth().query.toString()]).data;
export const usePending = () => useApi(z.array(expense), ["/api/expenses?", "status=pending"]).data ?? [];
export const useTemplates = () => useApi(z.array(template), ["/api/recurring"]).data ?? [];

export const useQueued = () =>
  useMutationState({
    filters: { predicate: (m) => m.state.isPaused },
    select: (m) => request.safeParse(m.state.variables).data,
  }).flatMap((r, i) => (r?.[0] === "POST" && r[1] === "/api/expenses" ? (unsent(r[2], -1 - i) ?? []) : []));

export function syncExpense(client: QueryClient, data: unknown, [method]: Request) {
  const { id } = z.object({ id: z.number() }).parse(data);
  const row = method === "DELETE" ? undefined : expense.parse(data);
  for (const [key, rows] of client.getQueriesData<Expense[]>({ queryKey: ["/api/expenses?"] })) {
    if (!rows) continue;
    const { from = "", to = "~", status, ...rest } = Object.fromEntries(new URLSearchParams(String(key[1])));
    const fits = row && row.date >= from && row.date <= to && (!status || row.status === status);
    if (Object.keys(rest).length && row) client.invalidateQueries({ queryKey: key, exact: true });
    else
      client.setQueryData(
        key,
        [...rows.filter((r) => r.id !== id), ...(row && fits ? [row] : [])].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id),
      );
  }
  ["/api/settings", "/api/tags", "/api/notes", "/api/bin", "/api/stats"].forEach((p) => refresh(client, p));
}

export const inBase = (rows: Expense[], base: string) => rows.reduce((s, e) => s + (e.baseAmount ?? (e.currency === base ? e.amount : 0)), 0);
