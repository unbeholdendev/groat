import { createContext, type FormEvent, Fragment, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { Unit } from "../shared/amount";

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
export type Draft = { note: string; amount: number; currency: string; date: string; categoryId: number; tags: string[] };

export const button = "rounded-lg bg-zinc-900 py-2 text-white dark:bg-zinc-100 dark:text-zinc-900";

export type Request = [method: string, path: string, body?: unknown];
async function send(...[method, path, body]: Request) {
  const res = await fetch(path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error);
  return json;
}
export const useSend = (onSuccess?: () => void) => useMutation({ mutationFn: (r: Request) => send(...r), onSuccess });

export const useSettings = () => useQuery<Settings>({ queryKey: ["/api/settings"] }).data;
export const UnitContext = createContext<[Unit, (u: Unit) => void]>(["BTC", () => {}]);

export function SettingsForm(props: {
  settings: Settings;
  path: string;
  method: string;
  title: string;
}) {
  const onboarding = !props.settings.onboarded;
  const [baseCurrency, setBase] = useState(props.settings.baseCurrency);
  const [currencies, setCurrencies] = useState(props.settings.currencies.join(", "));
  const [theme, setTheme] = useState(props.settings.theme);
  const mutation = useSend();
  const message = mutation.isSuccess ? "Saved" : mutation.error?.message;

  function save(e: FormEvent) {
    e.preventDefault();
    mutation.mutate([
      props.method,
      props.path,
      { baseCurrency: baseCurrency.trim().toUpperCase(), currencies: currencies.toUpperCase().split(/[\s,]+/).filter(Boolean), theme },
    ]);
  }

  return (
    <form onSubmit={save} className={`flex flex-col gap-3 ${onboarding ? "mx-auto max-w-md p-4" : ""}`}>
      <h1 className="text-xl font-semibold">{props.title}</h1>
      <label className="flex flex-col gap-1 text-sm">
        Base currency
        <input className="input" value={baseCurrency} onChange={(e) => setBase(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Currencies you use
        <input className="input" placeholder="GBP, EUR, BTC" value={currencies} onChange={(e) => setCurrencies(e.target.value)} />
      </label>
      {!onboarding && (
        <label className="flex flex-col gap-1 text-sm">
          Theme
          <select className="input" value={theme} onChange={(e) => setTheme(e.target.value as Settings["theme"])}>
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      )}
      {message && <p className="text-sm text-zinc-500">{message}</p>}
      <button className={button}>{onboarding ? "Start" : "Save"}</button>
    </form>
  );
}

export const useCategories = () => useQuery<Category[]>({ queryKey: ["/api/categories"] }).data ?? [];

export function CategoryOptions({ categories, except }: { categories: Category[]; except?: number }) {
  const children = (id: number | null) => categories.filter((c) => c.parentId === id && c.id !== except);
  return children(null).map((p) => (
    <Fragment key={p.id}>
      <option value={p.id}>
        {p.icon} {p.name}
      </option>
      {children(p.id).map((c) => (
        <option key={c.id} value={c.id}>
          {"   "}
          {c.icon} {c.name}
        </option>
      ))}
    </Fragment>
  ));
}

export const dated = /^\d{4}-\d{2}-\d{2}$/;
export function pick<K extends string>(search: Record<string, unknown>, rules: Record<K, RegExp>) {
  const valid: Partial<Record<K, string>> = {};
  for (const k in rules) {
    const v = search[k];
    if (typeof v === "string" && rules[k].test(v)) valid[k] = v;
  }
  return valid;
}
