import { useRef } from "react";
import { Bin } from "./bin";
import { TransactionForm } from "./form/transaction-form";
import { Month } from "./month";
import { useTransactions } from "./queries";
import { Recurring } from "./recurring";
import { route, useList } from "./use-month";

export function Transactions() {
  const { new: adding, edit, view } = route.useSearch();
  const list = useList();
  const navigate = route.useNavigate();
  const listed = useTransactions();
  const newest = useRef<number>(undefined);
  const open = !!(adding || Number(edit));
  if (listed && (newest.current === undefined || open || view === "bin")) newest.current = Math.max(0, ...listed.map((e) => e.id));

  if (view === "bin") return <Bin />;
  if (open) return <TransactionForm />;
  if (view === "recurring") return <Recurring onEdit={(template) => navigate({ search: { ...list, new: "1" }, state: { template } })} />;
  return <Month newest={newest.current ?? 0} />;
}
