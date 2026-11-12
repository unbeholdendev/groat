import { getRouteApi } from "@tanstack/react-router";
import { type Kind, kind as kindSchema } from "../../../shared/schema";
import { useSettings } from "../../lib/api";
import { today } from "../../lib/dates";
import { iso } from "../../lib/period";
import type { Transaction } from "../../lib/schemas";

export const route = getRouteApi("/");

export function useList() {
  const { new: adding, edit, ...list } = route.useSearch();
  return list;
}

export function useEdit() {
  const list = useList();
  const navigate = route.useNavigate();
  return (e: Transaction) => e.id > 0 && navigate({ search: { ...list, edit: String(e.id) } });
}

export function useMonth() {
  const { new: adding, edit, view, month, kind, ...filter } = route.useSearch();
  const navigate = route.useNavigate();
  const setFilter = (search: typeof filter) => navigate({ search: { ...search, kind }, replace: true });
  const setKind = (kind?: Kind) => navigate({ search: (prev) => ({ ...prev, kind }), replace: true });
  const filtered = Object.values(filter).some(Boolean);
  const shown = month ?? today().slice(0, 7);
  const [y, m] = shown.split("-").map(Number);
  const end = new Date(y, m, 0);
  const step = (n: number) => iso(new Date(y, m - 1 + n, 1)).slice(0, 7);
  const label = end.toLocaleDateString("en-GB", {
    month: "long",
    ...(y !== new Date().getFullYear() && { year: "numeric" }),
  });
  const query = new URLSearchParams(
    Object.entries(filtered ? filter : { from: `${shown}-01`, to: iso(end) }).filter(([, v]) => v),
  );
  return {
    month,
    filter,
    setFilter,
    filtered,
    shown,
    end,
    step,
    label,
    query,
    kind: useSettings()?.income ? kindSchema.safeParse(kind).data : undefined,
    setKind,
  };
}
