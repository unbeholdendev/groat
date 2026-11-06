import { useEffect, useState } from "react";
import { useMutationState } from "@tanstack/react-query";
import type { Unit } from "../../../shared/amount";
import { money } from "../../lib/money";
import { type Category, transaction, type Request, request, unsent } from "../../lib/schemas";

export function useReceipt(categories: Category[], unit: Unit, send: (r: Request) => void) {
  const receipt = useMutationState({
    filters: {
      mutationKey: ["send"],
      predicate: ({ state }) => {
        if ((state.status !== "success" && !state.isPaused) || Date.now() - state.submittedAt > 5000) return false;
        const [method, path] = request.parse(state.variables);
        if (method === "POST") return path === "/api/transactions";
        return method === "DELETE" && /^\/api\/transactions\/\d+$/.test(path) && !state.isPaused;
      },
    },
    select: ({ mutationId, state }) => {
      const [method, , body] = request.parse(state.variables);
      const row = transaction.safeParse(state.data).data ?? unsent(body, 0);
      return row && { id: mutationId, binned: method === "DELETE", row };
    },
  })
    .filter((r) => r !== undefined)
    .at(-1);
  const [dismissed, setDismissed] = useState(0);
  const [hold, setHold] = useState(false);
  const shown = receipt && receipt.id > dismissed ? receipt : undefined;
  useEffect(() => {
    if (!shown || hold) return;
    const timer = setTimeout(() => setDismissed(shown.id), 5000);
    return () => clearTimeout(timer);
  }, [shown?.id, hold]);
  const category = shown && categories.find((c) => c.id === shown.row.categoryId);
  const text =
    shown &&
    [`${shown.binned ? "Binned" : "Added"} ${shown.row.note}`.trim(), category && `${category.icon} ${category.name}`, money(shown.row.amount, shown.row.currency, unit), !shown.row.id && "will sync"]
      .filter(Boolean)
      .join(" · ");
  const dismiss = () => shown && setDismissed(shown.id);
  const undo = () => shown && (dismiss(), send(shown.binned ? ["POST", `/api/bin/${shown.row.id}/restore`] : ["DELETE", `/api/transactions/${shown.row.id}?purge`]));
  return { shown, category, text, dismiss, undo, setHold };
}

export type Receipt = ReturnType<typeof useReceipt>;
