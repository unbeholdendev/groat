import { createContext, type CSSProperties, type FormEvent, Fragment, type ReactNode, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
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
export const UnitContext = createContext<[Unit, (u: Unit) => void]>(["BTC", () => {}]);

export const today = () => new Date().toLocaleDateString("en-CA");

export function dayLabel(date: string) {
  const diff = Math.round((Date.parse(today()) - Date.parse(date)) / 864e5);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  const d = new Date(`${date}T00:00`);
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(d.getFullYear() !== new Date().getFullYear() && { year: "numeric" }),
  });
}

export const Icon = ({ children, className = "size-[21px]" }: { children: ReactNode; className?: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden className={`${className} fill-none stroke-current stroke-[1.6] [stroke-linecap:round] [stroke-linejoin:round]`}>
    {children}
  </svg>
);
export const Chevron = ({ className = "size-2.5 text-ink3" }: { className?: string }) => (
  <Icon className={className}>
    <path d="m6 9 6 6 6-6" />
  </Icon>
);

export const Tile = ({ category, small }: { category?: { icon: string; color: string; builtin?: boolean }; small?: boolean }) => (
  <span
    aria-hidden
    className={`tile ${small ? "size-7 rounded-[9px] text-[15px]" : "size-9 text-[19px]"}`}
    style={{ "--c": category && !category.builtin ? category.color : undefined } as CSSProperties}
  >
    {category && !category.builtin ? (
      category.icon
    ) : (
      <Icon className={`${small ? "size-4" : "size-5"} stroke-[1.8] text-ink3`}>
        <circle cx="12" cy="12" r="7.5" strokeDasharray="3 3.3" />
      </Icon>
    )}
  </span>
);

export const Confirm = (props: { ask: ReactNode; yes: string; onYes: () => void; onNo: () => void }) => (
  <span className="rise inline-flex items-center gap-1 text-[13px] font-medium">
    <span className="text-ink2">{props.ask}</span>
    <button type="button" autoFocus className="hit rounded-chip px-2.5 py-1.5 text-ink2" onClick={props.onNo}>
      Keep
    </button>
    <button type="button" className="hit rounded-chip px-2.5 py-1.5 text-up" onClick={props.onYes}>
      {props.yes}
    </button>
  </span>
);

export const chip = "relative inline-flex shrink-0 items-center whitespace-nowrap gap-1.5 rounded-chip border border-line2 bg-surface px-2 py-[3px] text-[13px] font-medium text-ink has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent";
export const divide = "relative not-last:after:absolute not-last:after:inset-x-0 not-last:after:bottom-0 not-last:after:ml-16 not-last:after:h-px not-last:after:bg-line";

const currencyNames = new Intl.DisplayNames(["en-GB"], { type: "currency" });
const allCurrencies = [...Intl.supportedValuesOf("currency"), "BTC"].sort();
const CurrencyOptions = ({ except = [] }: { except?: string[] }) =>
  allCurrencies
    .filter((c) => !except.includes(c))
    .map((c) => (
      <option key={c} value={c}>
        {c} · {c === "BTC" ? "Bitcoin" : currencyNames.of(c)}
      </option>
    ));

export function SettingsForm(props: {
  settings: Settings;
  path: string;
  method: string;
  title: string;
  onSaved?: () => void;
}) {
  const onboarding = !props.settings.onboarded;
  const [baseCurrency, setBase] = useState(props.settings.baseCurrency);
  const [others, setOthers] = useState(props.settings.currencies.filter((c) => c !== props.settings.baseCurrency));
  const [theme, setTheme] = useState(props.settings.theme);
  const mutation = useSend(props.onSaved);
  const message = mutation.isSuccess ? "Saved" : mutation.error?.message;

  function save(e: FormEvent) {
    e.preventDefault();
    mutation.mutate([
      props.method,
      props.path,
      { baseCurrency, currencies: others, theme },
    ]);
  }

  return (
    <form onSubmit={save} onChangeCapture={() => mutation.reset()} className="flex flex-col gap-4">
      <h1 className="text-display font-bold">{props.title}</h1>
      {onboarding && <p className="-mt-2 text-ink2">Pick the currency totals are shown in, and any others you spend in. You can change both later.</p>}
      <label className="label">
        Base currency
        <select className="input" value={baseCurrency} onChange={(e) => (setBase(e.target.value), setOthers(others.filter((c) => c !== e.target.value)))}>
          <CurrencyOptions />
        </select>
      </label>
      <fieldset className="label">
        <legend className="mb-1.5">Other currencies you spend in</legend>
        <div className="flex flex-wrap gap-x-1.5 gap-y-3">
          {others.map((c) => (
            <button type="button" key={c} aria-label={`Remove ${c}`} className={`${chip} hit`} onClick={() => (setOthers(others.filter((o) => o !== c)), mutation.reset())}>
              {c}
              <Icon className="size-2.5 stroke-2 text-ink3">
                <path d="M6 6l12 12M18 6 6 18" />
              </Icon>
            </button>
          ))}
          <label className={`${chip} text-ink2`}>
            <Icon className="size-2.5 stroke-2">
              <path d="M12 5v14M5 12h14" />
            </Icon>
            Add
            <select aria-label="Add a currency" className="absolute inset-x-0 -inset-y-2.5 opacity-0" value="" onChange={(e) => setOthers([...others, e.target.value])}>
              <option value="" disabled>
                Add a currency
              </option>
              <CurrencyOptions except={[baseCurrency, ...others]} />
            </select>
          </label>
        </div>
      </fieldset>
      {!onboarding && (
        <label className="label">
          Theme
          <select className="input" value={theme} onChange={(e) => (setTheme(e.target.value as Settings["theme"]), mutation.mutate([props.method, props.path, { theme: e.target.value }]))}>
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      )}
      {message && <p className={`text-sm ${mutation.isError ? "text-up" : "text-ink3"}`}>{message}</p>}
      <button className="primary">{onboarding ? "Start" : "Save"}</button>
      {props.settings.ai && !onboarding && (
        <Link to="/chat" className="mt-4 flex items-center justify-between border-y border-line py-3">
          Past chats
          <Chevron className="size-4 -rotate-90 text-ink3" />
        </Link>
      )}
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
