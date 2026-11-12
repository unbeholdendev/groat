import { type QueryClient, useMutationState } from "@tanstack/react-query";
import { z } from "zod";
import type { Kind } from "../../../shared/schema";
import { useApi, useCategories, useSession } from "../../lib/api";
import { invalidate } from "../../lib/resources";
import { type Transaction, transaction, type Request, request, template, unsent } from "../../lib/schemas";
import { useMonth } from "./use-month";

export const useTransactionQuery = () =>
  useApi(z.array(transaction), ["/api/transactions?", useMonth().query.toString()]);
export const useTransactions = () => useTransactionQuery().data;
export const usePending = () => useApi(z.array(transaction), ["/api/transactions?", "status=pending"]).data ?? [];
export const useTemplates = () => useApi(z.array(template), ["/api/recurring"]).data ?? [];

export const useQueued = () => {
  const owner = useSession()?.user?.username;
  return useMutationState({
    filters: { predicate: (m) => m.state.isPaused && m.meta?.owner === owner },
    select: (m) => request.safeParse(m.state.variables).data,
  }).flatMap((r, i) => (r?.[0] === "POST" && r[1] === "/api/transactions" ? (unsent(r[2], -1 - i) ?? []) : []));
};

export function syncTransaction(client: QueryClient, data: unknown, [method]: Request) {
  const { id } = z.object({ id: z.number() }).parse(data);
  const row = method === "DELETE" ? undefined : transaction.parse(data);
  for (const [key, rows] of client.getQueriesData<Transaction[]>({ queryKey: ["/api/transactions?"] })) {
    if (!rows) continue;
    const { from = "", to = "~", status, ...rest } = Object.fromEntries(new URLSearchParams(String(key[1])));
    const fits = row && row.date >= from && row.date <= to && (!status || row.status === status);
    if (Object.keys(rest).length && row) client.invalidateQueries({ queryKey: key, exact: true });
    else
      client.setQueryData(
        key,
        [...rows.filter((r) => r.id !== id), ...(row && fits ? [row] : [])].sort(
          (a, b) => b.date.localeCompare(a.date) || b.id - a.id,
        ),
      );
  }
  void invalidate(client, ["transactions"], ["/api/transactions?"]);
}

export const inBase = (rows: Transaction[], base: string) =>
  rows.reduce((s, e) => s + (e.baseAmount ?? (e.currency === base ? e.amount : 0)), 0);

export const useKindOf = () => {
  const categories = useCategories();
  return (e: { categoryId: number | null }): Kind => categories.find((c) => c.id === e.categoryId)?.kind ?? "expense";
};
