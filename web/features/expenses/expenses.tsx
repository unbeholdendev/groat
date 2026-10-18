import { useRef } from "react";
import { Bin } from "./bin";
import { ExpenseForm } from "./form/expense-form";
import { Month } from "./month";
import { useExpenses } from "./queries";
import { Recurring } from "./recurring";
import { route, useList } from "./use-month";

export function Expenses() {
  const { new: adding, edit, view } = route.useSearch();
  const list = useList();
  const navigate = route.useNavigate();
  const listed = useExpenses();
  const newest = useRef<number>(undefined);
  const open = !!(adding || Number(edit));
  if (listed && (newest.current === undefined || open || view === "bin")) newest.current = Math.max(0, ...listed.map((e) => e.id));

  if (view === "bin") return <Bin />;
  if (open) return <ExpenseForm />;
  if (view === "recurring") return <Recurring onEdit={(template) => navigate({ search: { ...list, new: "1" }, state: { template } })} />;
  return <Month newest={newest.current ?? 0} />;
}
