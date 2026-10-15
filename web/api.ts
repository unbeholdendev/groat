import { useMutation, useQuery } from "@tanstack/react-query";

export type Expense = {
  id: number;
  note: string;
  amount: number;
  currency: string;
  date: string;
  categoryId: number;
  tags: string[];
  baseAmount?: number | null;
  status?: "normal" | "pending";
  recurringId?: number | null;
};
export type Category = { id: number; name: string; icon: string; color: string; parentId: number | null; builtin: boolean };
export type Settings = {
  baseCurrency: string;
  currencies: string[];
  lastCurrency: string;
  theme: "system" | "light" | "dark";
  onboarded: boolean;
  ai: boolean;
};
export type Session = { setup: boolean; user: { username: string; role: "admin" | "member" } | null };
export type Draft = { note: string; amount: number; currency: string; date: string; categoryId: number; tags: string[] };

export type Request = [method: string, path: string, body?: unknown];
export async function send(...[method, path, body]: Request) {
  const res = await fetch(path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => {
    throw new Error("Couldn’t reach the server. Check your connection and try again.");
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(json.error ?? `The server answered ${res.status}.`), { status: res.status });
  return json;
}
export const useSend = (onSuccess?: () => void) => useMutation<unknown, Error, Request>({ mutationKey: ["send"], onSuccess });

export const useSettings = () => useQuery<Settings>({ queryKey: ["/api/settings"] }).data;
export const useCategories = () => useQuery<Category[]>({ queryKey: ["/api/categories"] }).data ?? [];
