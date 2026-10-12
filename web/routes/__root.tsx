import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createRootRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { parseAmount, type Unit } from "../../shared/amount";
import { money } from "../period";
import {
  type Category,
  CategoryOptions,
  Chevron,
  dayLabel,
  type Draft,
  FormContext,
  Icon,
  send,
  type Settings,
  SettingsForm,
  today,
  UnitContext,
  useCategories,
  useSend,
  useSettings,
} from "../shared";
import type { Chat } from "./chat";

export const Route = createRootRoute({ component: App });

type Suggestion = { note: string; categoryId: number; currency: string };

function useTheme(theme?: Settings["theme"]) {
  useEffect(() => {
    if (!theme) return;
    try {
      localStorage.setItem("theme", theme);
    } catch {}
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () =>
      document.documentElement.classList.toggle("dark", theme === "dark" || (theme !== "light" && media.matches));
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
}

const chip = "relative inline-flex items-center gap-1.5 rounded-[7px] border border-line2 bg-surface px-2 py-[3px] text-[13px] font-medium text-ink";

const tabs: [string, string, ReactNode][] = [
  ["/", "Expenses", <path d="M4 6h16M4 12h16M4 18h10" />],
  ["/stats", "Stats", <path d="M5 20V10M12 20V4M19 20v-7" />],
  [
    "/categories",
    "Categories",
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </>,
  ],
  [
    "/settings",
    "Settings",
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" />
    </>,
  ],
];

function App() {
  const settings = useSettings();
  const unitState = useState<Unit>("BTC");
  const [formOpen, setFormOpen] = useState(false);
  const path = useLocation().pathname;
  const navigate = useNavigate();
  const categories = useCategories();
  useTheme(settings?.theme);

  if (!settings) return null;
  if (!settings.onboarded)
    return (
      <main className="mx-auto max-w-md px-5 pt-12 pb-10">
        <SettingsForm settings={settings} path="/api/onboarding" method="POST" title="Welcome" />
      </main>
    );
  return (
    <UnitContext value={unitState}>
      <FormContext value={setFormOpen}>
        <main className="mx-auto max-w-md px-5 pt-[max(env(safe-area-inset-top),20px)] pb-48">
          <Outlet />
        </main>
      </FormContext>
      <div className="fixed inset-x-0 bottom-0 z-10">
        {(path === "/stats" || (path === "/" && !formOpen)) && (
          <Bar
            settings={settings}
            unit={unitState[0]}
            categories={categories}
            onForm={(draft) => navigate({ to: "/", state: { draft } })}
            onChat={(id) => navigate({ to: "/chat", search: { id: String(id) } })}
          />
        )}
        <nav aria-label="Main" className="border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto grid max-w-md grid-cols-4 pt-2 pb-2.5">
            {tabs.map(([to, label, icon]) => (
              <Link
                key={to}
                to={to}
                activeOptions={{ exact: to === "/" }}
                className={`flex flex-col items-center gap-1 text-[11px] font-medium ${path === to || (to === "/settings" && path === "/chat") ? "text-ink" : "text-ink3"}`}
              >
                <Icon>{icon}</Icon>
                {label}
              </Link>
            ))}
          </div>
        </nav>
      </div>
    </UnitContext>
  );
}

function parse(text: string, currencies: string[]) {
  let amount: string | null = null;
  let currency: string | null = null;
  let unit: Unit | null = null;
  const tags: string[] = [];
  const words: string[] = [];
  const parts = text.split(/(\s+)/).map((w) => {
    const code = w.toUpperCase();
    if (/^#\S+$/.test(w)) return tags.push(w.slice(1)), [w, "rounded-[3px] bg-track text-ink2 shadow-[0_0_0_2px_var(--track)]"];
    if (!amount && /^\d+([.,]\d+)?$/.test(w)) return (amount = w.replace(",", ".")), [w, "rounded-[3px] bg-accent-soft text-accent shadow-[0_0_0_2px_var(--accent-soft)]"];
    if (!currency && (currencies.includes(code) || code === "SATS")) {
      currency = code === "SATS" ? "BTC" : code;
      if (code === "SATS") unit = "sats";
      return [w, "text-accent"];
    }
    if (w.trim()) words.push(w);
    return [w, ""];
  });
  return { parts, amount: amount as string | null, currency: currency as string | null, unit: unit as Unit | null, tags, note: words.join(" ") };
}

function Bar(props: { settings: Settings; unit: Unit; categories: Category[]; onForm: (d: Draft) => void; onChat: (id: number) => void }) {
  const { settings, unit, categories } = props;
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [date, setDate] = useState(today);
  const mirror = useRef<HTMLDivElement>(null);
  const ask = settings.ai && text.startsWith("?");
  const p = parse(ask ? "" : text, settings.currencies);
  const guess = useQuery<Suggestion[]>({
    queryKey: ["/api/notes?prefix=", encodeURIComponent(p.note)],
    enabled: p.note.length > 1,
  }).data?.[0];
  const category = categories.find((c) => c.id === (categoryId ?? (p.note.length > 1 ? guess?.categoryId : undefined)));
  const currency = p.currency ?? (p.note.length > 1 ? guess?.currency : undefined) ?? settings.lastCurrency;
  const adding = useSend(() => (setText(""), setCategoryId(null), setDate(today())));
  const asking = useMutation({ mutationFn: (message: string) => send("POST", "/api/chats", { message }) as Promise<Chat> });
  const chat = asking.data;
  const answer = chat?.messages?.findLast((m) => m.role === "assistant" && m.content)?.content;
  const drafts = (chat?.messages ?? [])
    .filter((m) => m.role === "tool" && m.content?.startsWith('{"draft"'))
    .map((m) => (JSON.parse(m.content!) as { draft: Draft }).draft);
  const active = focused || !!text;
  const sync = () => requestAnimationFrame(() => mirror.current && (mirror.current.scrollLeft = mirror.current.nextElementSibling!.scrollLeft));

  const seed = (): Draft => ({
    note: p.note,
    amount: (p.amount && parseAmount(p.amount, currency, p.unit ?? unit)) || 0,
    currency,
    date,
    categoryId: category?.id ?? 0,
    tags: p.tags,
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (ask) return text.slice(1).trim() && asking.mutate(text.slice(1).trim());
    if (!p.amount) return props.onForm(seed());
    adding.mutate([
      "POST",
      "/api/expenses",
      { note: p.note, amount: p.amount, currency, unit: p.unit ?? unit, date, categoryId: category?.id, tags: p.tags },
    ]);
  }

  return (
    <>
      {!asking.isIdle && <div className="fixed inset-0 -z-10 bg-bg/75" onClick={() => asking.reset()} />}
      <form onSubmit={submit} className="mx-auto max-w-md bg-[linear-gradient(transparent,var(--bg)_26px)] px-3 pt-7 pb-2.5">
        {!asking.isIdle && (
          <section
            aria-live="polite"
            className="rise mb-2.5 max-h-[55dvh] overflow-y-auto rounded-[14px] border border-line2 bg-surface px-4 pt-3.5 pb-2 shadow-[0_12px_32px_-14px_rgb(27_28_31/0.28)]"
          >
            <p className={`mt-1.5 text-[17px] leading-snug font-medium whitespace-pre-wrap ${asking.isPending ? "text-ink3" : ""}`}>
              {(asking.error && "Couldn’t reach the AI service. Check its settings on the server, then try again.") ?? answer ?? (asking.isPending ? "Looking at your expenses…" : "No answer came back.")}
            </p>
            {drafts.map((d, i) => (
              <button
                type="button"
                key={i}
                onClick={() => (props.onForm(d), asking.reset())}
                className="mt-3 flex w-full justify-between rounded-lg border border-line2 px-3 py-2 text-left text-sm"
              >
                <span>
                  Review draft: <b className="font-medium">{d.note}</b>
                </span>
                {money(d.amount, d.currency, unit)}
              </button>
            ))}
            <div className="mt-3 flex justify-end gap-1 border-t border-line pt-1.5">
              <button type="button" onClick={() => asking.reset()} className="rounded-[7px] px-2.5 py-1.5 text-[13px] font-medium text-ink2">
                Close
              </button>
              {asking.error && (
                <button type="button" onClick={() => asking.mutate(asking.variables!)} className="rounded-[7px] px-2.5 py-1.5 text-[13px] font-medium text-accent">
                  Try again
                </button>
              )}
              {chat && (
                <button type="button" onClick={() => props.onChat(chat.id)} className="rounded-[7px] px-2.5 py-1.5 text-[13px] font-medium text-accent">
                  Continue in chat
                </button>
              )}
            </div>
          </section>
        )}
        {text && !ask && asking.isIdle && (
          <div className="rise flex items-center gap-1.5 px-1.5 pb-2 text-[13px] text-ink2">
            <label className={chip}>
              {category && <i className="size-1.5 rounded-full" style={{ background: category.color }} />}
              {category ? `${category.icon} ${category.name}` : "Category"}
              <Chevron />
              <select
                aria-label="Category"
                className="absolute inset-0 opacity-0"
                value={category?.id ?? ""}
                onChange={(e) => setCategoryId(Number(e.target.value) || null)}
              >
                <option value="">Category</option>
                <CategoryOptions categories={categories} />
              </select>
            </label>
            <span className="text-line2">·</span>
            <label className={chip}>
              {dayLabel(date)}
              <input aria-label="Date" type="date" className="absolute inset-0 opacity-0" value={date} onChange={(e) => setDate(e.target.value || today())} />
            </label>
            <span className="text-line2">·</span>
            <span>{currency === "BTC" ? (p.unit ?? unit) : currency}</span>
            {category && !categoryId && <span className="ml-auto text-xs text-ink3">from past notes</span>}
          </div>
        )}
        <div
          className={`flex min-h-[50px] items-center gap-2 rounded-xl border bg-surface py-[5px] pr-[5px] pl-3.5 ${active ? "border-accent shadow-[0_0_0_3px_var(--accent-soft),0_6px_18px_-8px_rgb(27_28_31/0.18)]" : "border-line2 shadow-[0_6px_18px_-10px_rgb(27_28_31/0.22)]"}`}
        >
          <div className="relative h-10 min-w-0 flex-1 text-[17px] font-medium tracking-[-0.01em]">
            <div ref={mirror} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden leading-10 whitespace-pre">
              {ask ? (
                <>
                  <span className="text-accent">?</span>
                  {text.slice(1)}
                </>
              ) : (
                p.parts.map(([w, style], i) => (
                  <span key={i} className={style}>
                    {w}
                  </span>
                ))
              )}
            </div>
            <input
              aria-label={settings.ai ? "Add an expense, or start with ? to ask" : "Add an expense"}
              className="absolute inset-0 w-full bg-transparent leading-10 text-transparent caret-accent outline-none focus-visible:outline-none placeholder:font-normal placeholder:text-ink3"
              placeholder={settings.ai ? "Add an expense, or ? to ask" : "ramen 24.50 #friends"}
              autoComplete="off"
              enterKeyHint={ask ? "send" : "done"}
              value={text}
              onChange={(e) => (setText(e.target.value), adding.reset(), sync())}
              onSelect={sync}
              onScroll={sync}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
            />
          </div>
          {text.trim() ? (
            <button disabled={adding.isPending || asking.isPending} className="primary inline-flex h-[38px] items-center gap-1.5 px-3.5">
              {ask ? "Ask" : p.amount ? "Add" : "More"}
              <kbd className="text-xs opacity-75">↵</kbd>
            </button>
          ) : (
            <button aria-label="Full form" className="grid size-[38px] place-items-center rounded-lg text-ink3">
              <Icon className="size-[18px] stroke-2">
                <path d="M12 5v14M5 12h14" />
              </Icon>
            </button>
          )}
        </div>
        {(active || adding.error) && asking.isIdle && (
          <p className="flex justify-between gap-3 px-1.5 pt-[7px] text-xs text-ink3">
            {adding.error ? (
              <span className="text-up">{adding.error.message}</span>
            ) : ask ? (
              <span>Answers come from your own data. Nothing is saved from here.</span>
            ) : text && !p.amount ? (
              <span>Add an amount, like 24.50, or press Enter for the full form.</span>
            ) : settings.ai ? (
              <span>
                Start with <kbd className="rounded border border-line2 bg-surface px-1 text-[11px] font-medium text-ink2">?</kbd> to ask about your spending
              </span>
            ) : (
              <span>Note, amount, then any #tags</span>
            )}
            {!ask && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => props.onForm(seed())}
                className="shrink-0 text-ink2 underline decoration-line2 underline-offset-3"
              >
                Full form
              </button>
            )}
          </p>
        )}
      </form>
    </>
  );
}
