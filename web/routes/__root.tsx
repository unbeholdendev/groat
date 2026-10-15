import { type FormEvent, Fragment, type ReactNode, useEffect, useRef, useState } from "react";
import { useMutation, useMutationState, useQuery } from "@tanstack/react-query";
import { createRootRoute, Link, Outlet, useLocation, useNavigate, useSearch } from "@tanstack/react-router";
import { formatAmount, parseAmount, type Unit } from "../../shared/amount";
import { parse, type Part } from "../../shared/parse";
import { money } from "../period";
import {
  type Category,
  CategoryOptions,
  Chevron,
  dayLabel,
  type Draft,
  type Expense,
  Icon,
  type Request,
  send,
  type Session,
  type Settings,
  SettingsForm,
  SignIn,
  Tile,
  today,
  UnitContext,
  useCategories,
  useSend,
  useSettings,
} from "../shared";
import type { Chat } from "./chat";

export const Route = createRootRoute({ component: App });

const pill = "glass relative inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-chip px-3 text-[13px] font-medium text-ink shadow-dock has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent";

type Suggestion = { note: string; categoryId: number; currency: string; amount: number };

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
  ["/", "Expenses", <path d="M6 3.5h12v17l-2.5-1.5-2 1.5-1.5-1-1.5 1-2-1.5L6 20.5zM9.5 8.5h5M9.5 12h5M9.5 15.5h3" />],
  ["/stats", "Stats", <path d="m4 17 5-5 3.5 3L20 7.5M15 7.5h5v5" />],
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
      <path d="M4 8h9M19 8h1M4 16h1M11 16h9" />
      <circle cx="16" cy="8" r="3" />
      <circle cx="8" cy="16" r="3" />
    </>,
  ],
];

function App() {
  const session = useQuery<Session>({ queryKey: ["/api/session"] }).data;
  const settings = useSettings();
  const unitState = useState<Unit>("BTC");
  const search = useSearch({ strict: false });
  const path = useLocation().pathname;
  const current = path === "/chat" || search.view ? "/settings" : path;
  const navigate = useNavigate();
  const categories = useCategories();
  const [guide, setGuide] = useState(false);
  const bar = !search.new && !search.edit;
  useTheme(settings?.theme);

  if (!session) return null;
  if (!session.user)
    return (
      <main className="mx-auto max-w-md px-5 pt-12 pb-10">
        <SignIn setup={session.setup} />
      </main>
    );
  if (!settings) return null;
  if (!settings.onboarded)
    return (
      <main className="mx-auto max-w-md px-5 pt-12 pb-10">
        <SettingsForm settings={settings} path="/api/onboarding" method="POST" title="Welcome" onSaved={() => setGuide(true)} />
      </main>
    );
  return (
    <UnitContext value={unitState}>
      <main className="mx-auto max-w-md px-5 pt-[max(env(safe-area-inset-top),20px)] pb-[calc(10rem+env(safe-area-inset-bottom))] lg:pb-4">
        <Outlet />
      </main>
      <div className="fixed inset-x-2 bottom-[max(env(safe-area-inset-bottom),8px)] z-10 mx-auto max-w-md p-2 lg:sticky lg:bottom-6">
        <div aria-hidden className={`glass absolute inset-0 -z-10 rounded-dock shadow-dock ${bar ? "" : "lg:hidden"}`} />
        {bar && (
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
        <nav aria-label="Main" className="grid grid-cols-4 lg:fixed lg:top-6 lg:left-[calc(50%-432px)] lg:flex lg:w-44 lg:flex-col lg:gap-1">
          {tabs.map(([to, label, icon]) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: to === "/" }}
              aria-current={current === to ? "page" : undefined}
              className={`press flex h-[52px] flex-col items-center justify-center gap-1 rounded-field text-[11px] font-semibold lg:h-11 lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:text-[15px] lg:font-medium ${current === to ? "text-ink lg:bg-surface2" : "text-ink3 lg:text-ink2 lg:hover:bg-surface2 lg:hover:text-ink"}`}
            >
              <Icon className={`size-[22px] ${current === to ? "text-accent" : ""}`}>{icon}</Icon>
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </UnitContext>
  );
}

const styles = {
  tag: "rounded-token bg-track text-ink2 shadow-[0_0_0_2px_var(--track)]",
  amount: "rounded-token bg-accent-soft text-accent shadow-[0_0_0_2px_var(--accent-soft)]",
  currency: "text-accent",
  "": "",
};

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
  const guesses =
    useQuery<Suggestion[]>({
      queryKey: ["/api/notes?prefix=", encodeURIComponent(p.note)],
      enabled: p.note.length > 1,
    }).data ?? [];
  const guess = guesses[0];
  const line = (s: Suggestion) =>
    s.currency === "BTC"
      ? `${s.note} ${s.amount} sats `
      : `${s.note} ${formatAmount(s.amount, s.currency)}${s.currency === settings.lastCurrency ? "" : ` ${s.currency.toLowerCase()}`} `;
  const fills = p.note.length > 1 && !p.amount && !p.currency && !p.tags.length ? guesses.slice(0, 3) : [];
  const ghost = fills[0] && line(fills[0]).toLowerCase().startsWith(text.toLowerCase()) ? line(fills[0]).slice(text.length) : "";
  const fill = (s: Suggestion) => (setText(line(s)), sync(), input.current?.focus());
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      e.preventDefault();
      input.current?.focus();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);
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

  const key = ask ? "Ask" : text.trim() && p.amount ? "Add" : "Full form";
  const glyph = key === "Ask" ? "M12 19V5M6 11l6-6 6 6" : key === "Add" ? "M20 5v7a3 3 0 0 1-3 3H5M9 11l-4 4 4 4" : "M12 5v14M5 12h14";
  const tag = (w: string, kind: Part[1], i: number) => (
    <span key={i} className={styles[kind]}>
      {w}
    </span>
  );

  return (
    <>
      {card && <div className="fixed inset-0 -z-20 bg-bg/70" onClick={close} />}
      <form onSubmit={submit} onKeyDown={(e) => e.key === "Escape" && card && close()}>
        <div className="absolute inset-x-0 bottom-full grid gap-2 pb-2">
          {card && (
            <section
              ref={cardRef}
              tabIndex={-1}
              aria-live="polite"
              className="rise max-h-[55dvh] overflow-y-auto rounded-card bg-surface px-5 pt-[18px] pb-2.5 shadow-lift outline-none"
            >
              <p className={`text-[17px] leading-snug font-medium whitespace-pre-wrap ${asking.isPending ? "text-ink3" : ""}`}>
                {(asking.error && "Couldn’t reach the AI service. Check its settings on the server, then try again.") ?? answer ?? (asking.isPending ? "Looking at your expenses…" : "No answer came back.")}
              </p>
              {drafts.map((d, i) => (
                <button
                  type="button"
                  key={i}
                  onClick={() => (props.onForm(d), asking.reset())}
                  className="press mt-3 flex w-full justify-between gap-3 rounded-field bg-surface2 px-3.5 py-2.5 text-left"
                >
                  <span>
                    Review draft: <b className="font-medium">{d.note}</b>, {dayLabel(d.date)}
                  </span>
                  <span className="num whitespace-nowrap">{money(d.amount, d.currency, unit)}</span>
                </button>
              ))}
              <div className="mt-3 flex justify-end gap-1 border-t border-line pt-1.5">
                <button type="button" onClick={close} className="press hit rounded-chip px-2.5 py-1.5 text-[13px] font-medium text-ink2">
                  Close
                </button>
                {asking.error && (
                  <button type="button" onClick={() => asking.mutate(asking.variables!)} className="press hit rounded-chip px-2.5 py-1.5 text-[13px] font-medium text-accent">
                    Try again
                  </button>
                )}
                {chat && (
                  <button type="button" onClick={() => (clear(), props.onChat(chat.id))} className="press hit rounded-chip px-2.5 py-1.5 text-[13px] font-medium text-accent">
                    Continue in chat
                  </button>
                )}
              </div>
            </section>
          )}
          {fills.length > 0 && !card && (
            <div className="rise flex gap-1.5" aria-label="Past entries">
              {fills.map((s) => (
                <button key={s.note} type="button" className={`${pill} press hit min-w-0 shrink`} onMouseDown={(e) => e.preventDefault()} onClick={() => fill(s)}>
                  <span className="truncate">{s.note}</span>
                  <span className="num text-ink3">{money(s.amount, s.currency, unit)}</span>
                </button>
              ))}
            </div>
          )}
          {text && !ask && !card && (
            <div className="rise flex gap-1.5">
              <label className={`${pill} press ${category ? "pl-1" : ""}`}>
                {category && <Tile category={category} small />}
                {category ? category.name : "Category"}
                <Chevron />
                <select
                  aria-label="Category"
                  className="absolute inset-x-0 -inset-y-1.5 opacity-0"
                  value={category?.id ?? ""}
                  onChange={(e) => setCategoryId(Number(e.target.value) || null)}
                >
                  <option value="">Category</option>
                  <CategoryOptions categories={categories} />
                </select>
              </label>
              <label className={`${pill} press`}>
                {dayLabel(date)}
                <Chevron />
                <input
                  aria-label="Date"
                  type="date"
                  className="absolute inset-x-0 -inset-y-1.5 opacity-0"
                  max={today()}
                  value={date}
                  onClick={(e) => e.currentTarget.showPicker?.()}
                  onChange={(e) => setDate(e.target.value || today())}
                />
              </label>
              <span className={`${pill} num text-ink2`}>{currency === "BTC" ? (p.unit ?? unit) : currency}</span>
            </div>
          )}
        </div>
        <div
          className={`flex h-12 items-center gap-2 rounded-field border pr-[3px] pl-3.5 transition-[background-color,border-color,box-shadow] duration-200 ${active ? "border-accent bg-surface shadow-bar-active" : "border-transparent bg-surface2"}`}
        >
          {inChat && <span aria-hidden className="-mr-1 text-[17px] font-medium text-accent">?</span>}
          <div className="relative h-10 min-w-0 flex-1 text-[17px] font-medium tracking-[-0.01em] [word-spacing:0.25em]">
            <div ref={mirror} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden leading-10 whitespace-pre">
              {ask ? (
                <>
                  {!inChat && <span className="text-accent">?</span>}
                  {inChat ? text : text.slice(1)}
                </>
              ) : (
                <>
                  {p.parts.map(([w, kind], i) => tag(w, kind, i))}
                  {focused && <span className="text-ink3">{ghost.trimEnd()}</span>}
                </>
              )}
            </div>
            <input
              ref={input}
              aria-label={inChat ? "Ask about your spending" : settings.ai ? "Add an expense, or start with ? to ask" : "Add an expense"}
              className="absolute inset-0 w-full bg-transparent leading-10 text-transparent caret-accent outline-none [word-spacing:inherit] focus-visible:outline-none placeholder:font-normal placeholder:text-ink3"
              placeholder={inChat ? (props.chat ? "Reply" : "Ask about your spending") : "ramen 24.50"}
              autoComplete="off"
              enterKeyHint={ask ? "send" : "done"}
              value={text}
              onChange={(e) => (setText(e.target.value), adding.reset(), shown && dismiss(shown.id), sync())}
              onKeyDown={(e) => {
                const end = e.currentTarget.selectionStart === text.length;
                if (ghost && (e.key === "Tab" || (e.key === "ArrowRight" && end))) (e.preventDefault(), fill(fills[0]));
              }}
              onSelect={sync}
              onScroll={sync}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
            />
          </div>
          {!focused && !text && !inChat && (
            <kbd aria-hidden className="hidden rounded-token border border-line2 px-1.5 text-[11px] font-medium text-ink3 pointer-fine:inline">
              /
            </kbd>
          )}
          <button
            aria-label={key}
            disabled={adding.isPending || asking.isPending || (inChat && !question)}
            className={`press hit grid size-10 shrink-0 place-items-center rounded-chip transition-[scale,background-color,color] duration-200 disabled:opacity-50 ${!text.trim() && !inChat ? "text-ink3" : key === "Full form" ? "bg-accent-soft text-accent" : "bg-accent text-on-accent"}`}
          >
            <Icon key={glyph} className="size-[18px] stroke-2 transition-[scale,opacity] duration-300 ease-out starting:scale-50 starting:opacity-0">
              <path d={glyph} />
            </Icon>
          </button>
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
            className="flex min-h-7 items-center justify-between gap-3 px-1.5 pt-1.5 text-xs text-ink3"
          >
            {error ? (
              <span className="text-up">{error.message}</span>
            ) : ask ? (
              <span>Answers come from your own data. Expenses are only added once you review them.</span>
            ) : text && !p.amount ? (
              <span>Add an amount, like 24.50, or press Enter for the full form.</span>
            ) : text ? (
              <span className="flex min-w-0 gap-1 text-ink2">
                <span className="truncate">{p.note || "No note"}</span>·<span className="num shrink-0 text-ink">{money(seed().amount, currency, p.unit ?? unit)}</span>
                {p.tags.length > 0 && <span className="truncate">· {p.tags.map((t) => `#${t}`).join(" ")}</span>}
                {category && !categoryId && <span className="shrink-0 text-ink3">· category guessed</span>}
              </span>
            ) : shown ? (
              <span key={shown.id} className="rise flex min-w-0 items-center gap-2 text-ink2">
                <Tile category={receiptCategory} small />
                <span className="truncate">{`${shown.binned ? "Binned" : "Added"} ${shown.row.note}`.trim()}</span>·
                <span className="num shrink-0 text-ink">{money(shown.row.amount, shown.row.currency, unit)}</span>
                {!shown.row.id && <span className="shrink-0 text-ink3">· will sync</span>}
              </span>
            ) : queued > 0 ? (
              <span>Offline. Saved here, will sync.</span>
            ) : props.guide ? (
              <span className="text-ink2">Start with the last thing you paid for</span>
            ) : (
              <span className="min-w-0 [word-spacing:0.15em]">
                Try{" "}
                {examples.map((e, i) => (
                  <Fragment key={e}>
                    {i > 0 && " · "}
                    {parse(e, settings.currencies).parts.map(([w, kind], j) => tag(w, kind, j))}
                  </Fragment>
                ))}
                {settings.ai && (
                  <>
                    {" · "}
                    <span className="whitespace-nowrap">
                      Start with <kbd className="rounded-token border border-line2 bg-surface px-1 text-[11px] font-medium text-ink2">?</kbd> to ask
                    </span>
                  </>
                )}
              </span>
            )}
            {shown && !ask && !text ? (
              shown.row.id > 0 && (
                <button type="button" onClick={() => undo(shown)} className="press hit shrink-0 font-medium text-accent">
                  Undo
                </button>
              )
            ) : !ask && (!text || p.amount) && (
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => props.onForm(seed())} className="press hit shrink-0 font-medium text-ink2">
                Full form
              </button>
            )}
          </p>
        )}
      </form>
    </>
  );
}
