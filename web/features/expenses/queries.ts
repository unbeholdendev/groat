import { useMutationState } from "@tanstack/react-query";
import { z } from "zod";
import { useApi } from "../../lib/api";
import { type Expense, expense, request, template, unsent } from "../../lib/schemas";
import { useMonth } from "./use-month";

export const useExpenses = () => useApi(z.array(expense), ["/api/expenses?", useMonth().query.toString()]).data;
export const usePending = () => useApi(z.array(expense), ["/api/expenses?", "status=pending"]).data ?? [];
export const useTemplates = () => useApi(z.array(template), ["/api/recurring"]).data ?? [];

export const useQueued = () =>
  useMutationState({
    filters: { predicate: (m) => m.state.isPaused },
    select: (m) => request.safeParse(m.state.variables).data,
  }).flatMap((r, i) => (r?.[0] === "POST" && r[1] === "/api/expenses" ? (unsent(r[2], -1 - i) ?? []) : []));

export const inBase = (rows: Expense[], base: string) => rows.reduce((s, e) => s + (e.baseAmount ?? (e.currency === base ? e.amount : 0)), 0);
