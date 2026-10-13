import { type FormEvent, Fragment, type ReactNode, useEffect, useRef, useState } from "react";
import { useMutation, useMutationState, useQuery } from "@tanstack/react-query";
import { createRootRoute, Link, Outlet, useLocation, useNavigate, useSearch } from "@tanstack/react-router";
import { parseAmount, type Unit } from "../../shared/amount";
import { money } from "../period";
import {
  type Category,
  CategoryOptions,
  Chevron,
  chip,
  dayLabel,
  type Draft,
  type Expense,
  Icon,
  type Request,
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
  const search = useSearch({ strict: false });
  const path = useLocation().pathname;
  const current = path === "/chat" || search.view ? "/settings" : path;
  const navigate = useNavigate();
  const categories = useCategories();
  const [guide, setGuide] = useState(false);
  useTheme(settings?.theme);

  if (!settings) return null;
  if (!settings.onboarded)
    return (
      <main className="mx-auto max-w-md px-5 pt-12 pb-10">
        <SettingsForm settings={settings} path="/api/onboarding" method="POST" title="Welcome" onSaved={() => setGuide(true)} />
      </main>
    );
  return (
    <UnitContext value={unitState}>
      <main className="mx-auto max-w-md px-5 pt-[max(env(safe-area-inset-top),20px)] pb-48">
        <Outlet />
      </main>
      <div className="fixed inset-x-0 bottom-0 z-10">
        {!search.new && !search.edit && (
          <Bar
            settings={settings}
            unit={unitState[0]}
            categories={categories}
            guide={guide}
            onGuided={() => setGuide(false)}
            chat={path === "/chat" ? Number(search.id) || 0 : undefined}
            onForm={(draft) => navigate({ to: "/", search: { new: "1" }, state: { draft } })}
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
                aria-current={current === to ? "page" : undefined}
                className={`flex flex-col items-center gap-1 text-[11px] font-medium ${current === to ? "text-ink" : "text-ink3"}`}
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
    if (/^#\S+$/.test(w)) return tags.push(w.slice(1)), [w, "rounded-token bg-track text-ink2 shadow-[0_0_0_2px_var(--track)]"];
    if (!amount && /^\d+([.,]\d+)?$/.test(w)) return (amount = w.replace(",", ".")), [w, "rounded-token bg-accent-soft text-accent shadow-[0_0_0_2px_var(--accent-soft)]"];
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

function Bar(props: {
  settings: Settings;
  unit: Unit;
  categories: Category[];
  guide: boolean;
  onGuided: () => void;
  chat?: number;
  onForm: (d: Draft) => void;
  onChat: (id: number) => void;
}) {
  const { settings, unit, categories } = props;
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [date, setDate] = useState(today);
  const mirror = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const inChat = settings.ai && props.chat !== undefined;
  const ask = inChat || (settings.ai && text.startsWith("?"));
  const question = text.replace(/^\?/, "").trim();
  const p = parse(ask ? "" : text, settings.currencies);
  const guess = useQuery<Suggestion[]>({
    queryKey: ["/api/notes?prefix=", encodeURIComponent(p.note)],
    enabled: p.note.length > 1,
  }).data?.[0];
  const category = categories.find((c) => c.id === (categoryId ?? (p.note.length > 1 ? guess?.categoryId : undefined)));
  const currency = p.currency ?? (p.note.length > 1 ? guess?.currency : undefined) ?? settings.lastCurrency;
  const clear = () => (setText(""), setCategoryId(null), setDate(today()), props.onGuided());
  const adding = useSend(clear);
  const queued = useMutationState({ filters: { predicate: (m) => m.state.isPaused } }).length;
  const receipt = useMutationState({
    filters: {
      mutationKey: ["send"],
      predicate: ({ state }) => {
        if ((state.status !== "success" && !state.isPaused) || Date.now() - state.submittedAt > 5000) return false;
        const [method, path] = state.variables as Request;
        if (method === "POST") return path === "/api/expenses";
        return method === "DELETE" && /^\/api\/expenses\/\d+$/.test(path) && !state.isPaused;
      },
    },
    select: ({ mutationId, state }) => {
      const [method, , body] = state.variables as Request;
      const b = body as Expense & { amount: string; unit: Unit };
      const row = (state.data as Expense | undefined) ?? { ...b, id: 0, amount: parseAmount(b.amount, b.currency, b.unit) || 0 };
      return { id: mutationId, binned: method === "DELETE", row };
    },
  }).at(-1);
  const [dismissed, dismiss] = useState(0);
  const [hold, setHold] = useState(false);
  const shown = receipt && receipt.id > dismissed ? receipt : undefined;
  useEffect(() => {
    if (!shown || hold) return;
    const timer = setTimeout(() => dismiss(shown.id), 5000);
    return () => clearTimeout(timer);
  }, [shown?.id, hold]);
  const receiptCategory = shown && categories.find((c) => c.id === shown.row.categoryId);
  const receiptText =
    shown &&
    [
      `${shown.binned ? "Binned" : "Added"} ${shown.row.note}`.trim(),
      receiptCategory && `${receiptCategory.icon} ${receiptCategory.name}`,
      money(shown.row.amount, shown.row.currency, unit),
      !shown.row.id && "will sync",
    ]
      .filter(Boolean)
      .join(" · ");
  const undo = (r: NonNullable<typeof shown>) => (
    dismiss(r.id),
    adding.mutate(r.binned ? ["POST", `/api/bin/${r.row.id}/restore`] : ["DELETE", `/api/expenses/${r.row.id}?purge`])
  );
  useEffect(() => {
    if (adding.isPaused) (clear(), adding.reset());
  }, [adding.isPaused]);
  const asking = useMutation({
    mutationKey: ["ask", props.chat || null],
    mutationFn: (message: string) => send("POST", props.chat ? `/api/chats/${props.chat}/messages` : "/api/chats", { message }) as Promise<Chat>,
  });
  useEffect(() => asking.reset(), [props.chat]);
  const card = !asking.isIdle && !inChat;
  useEffect(() => void (card && cardRef.current?.focus()), [card]);
  useEffect(() => void (props.guide && input.current?.focus()), [props.guide]);
  const close = () => (asking.reset(), input.current?.focus());
  const error = adding.error ?? (inChat ? asking.error : null);
  const chat = asking.data;
  const answer = chat?.messages?.findLast((m) => m.role === "assistant" && m.content)?.content;
  const drafts = (chat?.messages ?? [])
    .filter((m) => m.role === "tool" && m.content?.startsWith('{"draft"'))
    .map((m) => (JSON.parse(m.content!) as { draft: Draft }).draft);
  const active = focused || !!text;
  const other = settings.currencies.find((c) => c !== "BTC" && c !== settings.lastCurrency);
  const examples = [other && `12 ${other.toLowerCase()}`, settings.currencies.includes("BTC") && "5000 sats", "#work"].filter(Boolean) as string[];
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
    if (ask) return question && asking.mutate(question, { onSuccess: (c) => inChat && (clear(), props.onChat(c.id)) });
    if (!p.amount) return props.onForm(seed());
    adding.mutate([
      "POST",
      "/api/expenses",
      { note: p.note, amount: p.amount, currency, unit: p.unit ?? unit, date, categoryId: category?.id, tags: p.tags },
    ]);
  }

  return (
    <>
      {card && <div className="fixed inset-0 -z-10 bg-bg/75" onClick={close} />}
      <form onSubmit={submit} onKeyDown={(e) => e.key === "Escape" && card && close()} className="mx-auto max-w-md bg-[linear-gradient(transparent,var(--bg)_26px)] px-3 pt-7 pb-2.5">
        {card && (
          <section
            ref={cardRef}
            tabIndex={-1}
            aria-live="polite"
            className="rise mb-2.5 outline-none max-h-[55dvh] overflow-y-auto rounded-card border border-line2 bg-surface px-4 pt-3.5 pb-2 shadow-lift"
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
                  Review draft: <b className="font-medium">{d.note}</b>, {dayLabel(d.date)}
                </span>
                <span className="whitespace-nowrap">{money(d.amount, d.currency, unit)}</span>
              </button>
            ))}
            <div className="mt-3 flex justify-end gap-1 border-t border-line pt-1.5">
              <button type="button" onClick={close} className="hit rounded-chip px-2.5 py-1.5 text-[13px] font-medium text-ink2">
                Close
              </button>
              {asking.error && (
                <button type="button" onClick={() => asking.mutate(asking.variables!)} className="hit rounded-chip px-2.5 py-1.5 text-[13px] font-medium text-accent">
                  Try again
                </button>
              )}
              {chat && (
                <button type="button" onClick={() => (clear(), props.onChat(chat.id))} className="hit rounded-chip px-2.5 py-1.5 text-[13px] font-medium text-accent">
                  Continue in chat
                </button>
              )}
            </div>
          </section>
        )}
        {text && !ask && !card && (
          <div className="rise flex items-center gap-1.5 px-1.5 pb-2 text-[13px] text-ink2">
            <label className={chip}>
              {category && <i className="size-1.5 rounded-full" style={{ background: category.color }} />}
              {category ? `${category.icon} ${category.name}` : "Category"}
              <Chevron />
              <select
                aria-label="Category"
                className="absolute inset-x-0 -inset-y-2.5 opacity-0"
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
              <input aria-label="Date" type="date" className="absolute inset-x-0 -inset-y-2.5 opacity-0" value={date} onChange={(e) => setDate(e.target.value || today())} />
            </label>
            <span className="text-line2">·</span>
            <span>{currency === "BTC" ? (p.unit ?? unit) : currency}</span>
            {category && !categoryId && <span className="ml-auto min-w-0 truncate text-xs text-ink3">from past notes</span>}
          </div>
        )}
        <div
          className={`flex min-h-[50px] items-center gap-2 rounded-xl border bg-surface py-[5px] pr-[5px] pl-3.5 ${active ? "border-accent shadow-bar-active" : "border-line2 shadow-bar"}`}
        >
          {inChat && <span aria-hidden className="-mr-1 text-[17px] font-medium text-accent">?</span>}
          <div className="relative h-10 min-w-0 flex-1 text-[17px] font-medium tracking-[-0.01em]">
            <div ref={mirror} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden leading-10 whitespace-pre">
              {ask ? (
                <>
                  {!inChat && <span className="text-accent">?</span>}
                  {inChat ? text : text.slice(1)}
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
              ref={input}
              aria-label={inChat ? "Ask about your spending" : settings.ai ? "Add an expense, or start with ? to ask" : "Add an expense"}
              className="absolute inset-0 w-full bg-transparent leading-10 text-transparent caret-accent outline-none focus-visible:outline-none placeholder:font-normal placeholder:text-ink3"
              placeholder={inChat ? (props.chat ? "Reply" : "Ask about your spending") : "ramen 24.50 #friends"}
              autoComplete="off"
              enterKeyHint={ask ? "send" : "done"}
              value={text}
              onChange={(e) => (setText(e.target.value), adding.reset(), shown && dismiss(shown.id), sync())}
              onSelect={sync}
              onScroll={sync}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
            />
          </div>
          {text.trim() || inChat ? (
            <button disabled={adding.isPending || asking.isPending || (inChat && !question)} className="primary hit inline-flex h-[38px] items-center gap-1.5 px-3.5">
              {ask ? "Ask" : p.amount ? "Add" : "Full form"}
              <Icon className="size-3.5 stroke-2 opacity-75">
                <path d="M20 5v7a3 3 0 0 1-3 3H5M9 11l-4 4 4 4" />
              </Icon>
            </button>
          ) : (
            <button aria-label="Full form" className="hit grid size-[38px] place-items-center rounded-lg text-ink3">
              <Icon className="size-[18px] stroke-2">
                <path d="M12 5v14M5 12h14" />
              </Icon>
            </button>
          )}
        </div>
        <span role="status" className="sr-only">
          {receiptText}
        </span>
        {(active || error || queued > 0 || shown || props.guide) && !card && (
          <p
            onMouseEnter={() => setHold(true)}
            onMouseLeave={() => setHold(false)}
            onFocus={() => setHold(true)}
            onBlur={() => setHold(false)}
            className="flex justify-between gap-3 px-1.5 pt-[7px] text-xs text-ink3"
          >
            {error ? (
              <span className="text-up">{error.message}</span>
            ) : ask ? (
              <span>Answers come from your own data. Expenses are only added once you review them.</span>
            ) : text && !p.amount ? (
              <span>Add an amount, like 24.50, or press Enter for the full form.</span>
            ) : shown ? (
              <span key={shown.id} className="rise min-w-0 truncate text-ink2">
                {receiptText}
              </span>
            ) : queued > 0 ? (
              <span>Offline. Saved here, will sync.</span>
            ) : props.guide ? (
              <span className="text-ink2">Start with the last thing you paid for</span>
            ) : (
              <span className="min-w-0">
                Try{" "}
                {examples.map((e, i) => (
                  <Fragment key={e}>
                    {i > 0 && " · "}
                    {parse(e, settings.currencies).parts.map(([w, style], j) => (
                      <span key={j} className={style}>
                        {w}
                      </span>
                    ))}
                  </Fragment>
                ))}
                {settings.ai && (
                  <>
                    {" · "}
                    <span className="whitespace-nowrap">
                      Start with <kbd className="rounded border border-line2 bg-surface px-1 text-[11px] font-medium text-ink2">?</kbd> to ask
                    </span>
                  </>
                )}
              </span>
            )}
            {shown && !ask && !text ? (
              shown.row.id > 0 && (
                <button type="button" onClick={() => undo(shown)} className="hit shrink-0 font-medium text-accent">
                  Undo
                </button>
              )
            ) : !ask && (!text || p.amount) && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => props.onForm(seed())}
                className="hit shrink-0 text-ink2 underline decoration-line2 underline-offset-3"
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
