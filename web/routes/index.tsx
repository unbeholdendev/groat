import { createFileRoute } from "@tanstack/react-router";
import { Expenses } from "../features/expenses/expenses";
import { dated, pick } from "../lib/dates";

export const Route = createFileRoute("/")({
  validateSearch: (s) =>
    pick(s, { q: /./, from: dated, to: dated, category: /^\d+$/, currency: /^\w+$/, tag: /./, new: /^1$/, edit: /^\d+$/, view: /^(bin|recurring)$/, month: /^\d{4}-\d{2}$/ }),
  component: Expenses,
});
