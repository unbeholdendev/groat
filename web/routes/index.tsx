import { type FormEvent, Fragment, useContext, useEffect, useRef, useState } from "react";
import { useMutationState, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useLocation } from "@tanstack/react-router";
import { formatAmount, parseAmount, type Unit } from "../../shared/amount";
import { change, iso, money, Pill, span, Total, usePeriod } from "../period";
import { type Draft, type Expense, type Request, useCategories, useSend, useSettings } from "../api";
import { CategoryOptions, Tile } from "../category";
import { dated, dayLabel, pick, today } from "../dates";
import { Chevron, Confirm, divide, Icon, UnitContext } from "../ui";

export const Route = createFileRoute("/")({
  validateSearch: (s) =>
    pick(s, { q: /./, from: dated, to: dated, category: /^\d+$/, currency: /^\w+$/, tag: /./, new: /^1$/, edit: /^\d+$/, view: /^(bin|recurring)$/, month: /^\d{4}-\d{2}$/ }),
  component: Expenses,
});

type Template = Omit<Expense, "date"> & {
  period: string;
  every: number;
  startDate: string;
  endDate: string | null;
  needsConfirmation: boolean;
  paused: boolean;
};
type Suggestion = { note: string; categoryId: number; currency: string; amount: number };

function Expenses() {
  const settings = useSettings()!;
  const [unit, setUnit] = useContext(UnitContext);
  const draft = useLocation().state.draft;
  const { new: adding, edit: editParam, view, month, ...filter } = Route.useSearch();
  const list = { ...filter, month, view };
  const showBin = view === "bin";
  const editing = Number(editParam) || null;
  const open = !!(adding || editing);
  const [showFilters, setShowFilters] = useState(false);
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(settings.lastCurrency);
  const [date, setDate] = useState(today);
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [tags, setTags] = useState("");
  const show = (amount: number, c: string) => money(amount, c, unit);

  function toggleUnit() {
    const next = unit === "BTC" ? "sats" : "BTC";
    const sats = currency === "BTC" && parseAmount(amount, "BTC", unit);
    if (sats) setAmount(formatAmount(sats, "BTC", next));
    setUnit(next);
  }
  const categories = useCategories();
  const navigate = Route.useNavigate();
  const setFilter = (search: typeof filter) => navigate({ search, replace: true });
  const edit = (e: Expense) => e.id > 0 && navigate({ search: { ...list, edit: String(e.id) } });
  const noRepeat = { period: "", every: "1", endDate: "", needsConfirmation: false };
  const [repeat, setRepeat] = useState(noRepeat);
  const [template, setTemplate] = useState<number | null>(null);
  const [asking, setAsking] = useState<string | null>(null);

  const filtered = Object.values(filter).some(Boolean);
  const shown = month ?? today().slice(0, 7);
  const [y, m] = shown.split("-").map(Number);
  const end = new Date(y, m, 0);
  const step = (n: number) => iso(new Date(y, m - 1 + n, 1)).slice(0, 7);
  const label = end.toLocaleDateString("en-GB", { month: "long", ...(y !== new Date().getFullYear() && { year: "numeric" }) });
  const query = new URLSearchParams(Object.entries(filtered ? filter : { from: `${shown}-01`, to: iso(end) }).filter(([, v]) => v));
  const listed = useQuery<Expense[]>({ queryKey: ["/api/expenses?", query.toString()] }).data;
  const expenses = listed ?? [];
  const pending = useQuery<Expense[]>({ queryKey: ["/api/expenses?", "status=pending"] }).data ?? [];
  const templates = useQuery<Template[]>({ queryKey: ["/api/recurring"] }).data ?? [];
  const bin = useQuery<Expense[]>({ queryKey: ["/api/bin"], enabled: showBin }).data;
  const suggestions =
    useQuery<Suggestion[]>({ queryKey: ["/api/notes?prefix=", encodeURIComponent(note)], enabled: open && !!note }).data ?? [];
  const queued = useMutationState({
    filters: { predicate: (m) => m.state.isPaused },
    select: (m) => m.state.variables as Request,
  }).flatMap(([method, path, body], i) => {
    if (method !== "POST" || path !== "/api/expenses") return [];
    const b = body as Expense & { amount: string; unit: Unit };
    return [{ ...b, id: -1 - i, amount: parseAmount(b.amount, b.currency, b.unit) || 0 }];
  });
  const mutation = useSend();
  const saving = useSend(reset);
  const error = saving.error?.message;
  const editRow = [...expenses, ...pending].find((e) => e.id === editing);
  const newest = useRef<number>(undefined);
  if (listed && (newest.current === undefined || open || showBin)) newest.current = Math.max(0, ...listed.map((e) => e.id));

  useEffect(() => {
    if (!draft) return;
    fill(draft);
    navigate({ search: (prev) => prev, state: {}, replace: true });
  }, [draft]);
  useEffect(() => {
    if (editRow) fill(editRow);
  }, [editing, !!editRow]);
  useEffect(() => {
    if (saving.isPaused) reset();
  }, [saving.isPaused]);

  function typeNote(value: string) {
    setNote(value);
    const match = suggestions.find((s) => s.note === value);
    if (match && !editing) {
      setAmount(formatAmount(match.amount, match.currency, unit));
      setCurrency(match.currency);
      setCategoryId(match.categoryId);
    }
  }

  const filterInput = (key: keyof typeof filter, label: string, type = "text") => (
    <input
      className="input min-w-0 flex-1"
      type={type}
      aria-label={label}
      placeholder={label}
      value={filter[key] ?? ""}
      onChange={(e) => setFilter({ ...filter, [key]: e.target.value })}
    />
  );

  function reset() {
    navigate({ search: list, replace: true });
    setCurrency(settings.lastCurrency);
    saving.reset();
    setNote("");
    setAmount("");
    setDate(today());
    setCategoryId("");
    setTags("");
    setRepeat(noRepeat);
    setTemplate(null);
  }

  function editTemplate(t: Template) {
    fill({ ...t, date: t.startDate });
    setTemplate(t.id);
    setRepeat({ period: t.period, every: String(t.every), endDate: t.endDate ?? "", needsConfirmation: t.needsConfirmation });
    navigate({ search: { ...list, new: "1" } });
  }

  function templateAction(t: Template, action: string) {
    setAsking(null);
    mutation.mutate(action === "DELETE" ? ["DELETE", `/api/recurring/${t.id}`] : ["POST", `/api/recurring/${t.id}/${action}`]);
  }

  function fill(e: Draft) {
    setTemplate(null);
    setRepeat(noRepeat);
    saving.reset();
    setNote(e.note);
    setAmount(e.amount ? formatAmount(e.amount, e.currency, unit) : "");
    setCurrency(e.currency);
    setDate(e.date);
    setCategoryId(e.categoryId || "");
    setTags(e.tags.join(", "));
    scrollTo(0, 0);
  }

  function save(e: FormEvent) {
    e.preventDefault();
    const body = {
      note,
      amount,
      currency,
      unit,
      date,
      categoryId: categoryId || undefined,
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    };
    saving.mutate(
      repeat.period
        ? [
            template ? "PUT" : "POST",
            template ? `/api/recurring/${template}` : "/api/recurring",
            { ...body, ...repeat, startDate: date, every: Number(repeat.every), endDate: repeat.endDate || null },
          ]
        : [editing ? "PUT" : "POST", editing ? `/api/expenses/${editing}` : "/api/expenses", body],
    );
  }

  async function setRate(ev: FormEvent<HTMLFormElement>, e: Expense) {
    ev.preventDefault();
    try {
      for (const [currency, rate] of new FormData(ev.currentTarget))
        if (rate) await mutation.mutateAsync(["PUT", "/api/rates", { date: e.date, currency, rate }]);
      setAsking(null);
    } catch {}
  }

  const row = (e: Expense, dated?: boolean) => {
    const category = categories.find((c) => c.id === e.categoryId);
    const Note = dated || e.id < 0 ? "span" : "button";
    const foreign = e.currency !== settings.baseCurrency && e.baseAmount !== undefined;
    return (
      <>
        <Tile category={category} />
        <span className="min-w-0 flex-1">
          <Note
            onClick={Note === "button" ? () => edit(e) : undefined}
            className={`block w-full truncate text-left font-medium ${Note === "button" ? "outline-none after:absolute after:inset-0 after:-outline-offset-2 focus-visible:after:outline-2 focus-visible:after:outline-accent" : ""}`}
          >
            {e.note}
            {e.recurringId && (
              <span title={`Recurring: ${templates.find((t) => t.id === e.recurringId)?.note ?? "deleted"}`}>
                <Icon className="ml-1.5 inline size-3.5 stroke-2 align-[-2px] text-ink3">
                  <path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4" />
                </Icon>
              </span>
            )}
          </Note>
          <span className="mt-0.5 block truncate text-xs font-medium text-ink3">
            {[dated && dayLabel(e.date), category?.name, ...e.tags.map((t) => `#${t}`)].filter(Boolean).join("  ")}
          </span>
        </span>
        <span className="num text-right text-[15px] font-medium whitespace-nowrap">
          {foreign && e.baseAmount != null ? show(e.baseAmount, settings.baseCurrency) : show(e.amount, e.currency)}
          {e.id < 0 && <span className="block font-sans text-xs text-ink3">Will sync</span>}
          {foreign && (
            <span className="relative block text-xs text-ink3">
              {e.baseAmount === null ? (
                <button className="hit font-sans text-amber underline underline-offset-2" onClick={() => (setAsking(`rate ${e.id}`), mutation.reset())}>
                  Set rate
                </button>
              ) : (
                show(e.amount, e.currency)
              )}
            </span>
          )}
        </span>
      </>
    );
  };
  const rowClass = "press relative flex h-[62px] items-center gap-3 px-4";
  const panel = "overflow-hidden rounded-panel bg-surface shadow-panel";

  const back = (
    <Link to="/settings" className="hit inline-flex items-center gap-1 text-ink2">
      <Icon className="size-4 stroke-2">
        <path d="m15 6-6 6 6 6" />
      </Icon>
      Settings
    </Link>
  );

  if (showBin && bin)
    return (
      <>
        <div className="flex items-center justify-between">
          {back}
          {asking === "empty" ? (
            <Confirm
              ask={`Delete ${bin.length} ${bin.length === 1 ? "expense" : "expenses"} for good?`}
              yes="Delete"
              onYes={() => (setAsking(null), mutation.mutate(["DELETE", "/api/bin"]))}
              onNo={() => setAsking(null)}
            />
          ) : (
            bin.length > 0 && (
              <button className="hit text-sm font-medium text-up" onClick={() => setAsking("empty")}>
                Empty bin
              </button>
            )
          )}
        </div>
        <h1 className="mt-4 text-display font-bold">Bin</h1>
        {bin.length === 0 && <p className="mt-4 text-ink3">The bin is empty.</p>}
        {bin.length > 0 && (
          <ul className={`mt-4 ${panel}`}>
            {bin.map((e) => (
              <li key={e.id} className={`${rowClass} ${divide}`}>
                {row(e, true)}
                <button className="quiet hit h-8 px-3 text-[13px]" onClick={() => mutation.mutate(["POST", `/api/bin/${e.id}/restore`])}>
                  Restore
                </button>
              </li>
            ))}
          </ul>
        )}
      </>
    );

  if (open)
    return (
      <form onSubmit={save} className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <button type="button" className="hit text-ink2" onClick={reset}>
            Cancel
          </button>
          <h1 className="text-[17px] font-semibold">{editing ? "Edit expense" : template ? "Edit recurring" : "New expense"}</h1>
          <button className="primary hit h-9" disabled={saving.isPending}>
            {editing || template ? "Save" : "Add"}
          </button>
        </div>
        <label className="label">
          Note
          <input className="input" value={note} onChange={(e) => typeNote(e.target.value)} list="notes" autoFocus={!note} />
        </label>
        <datalist id="notes">
          {suggestions.map((s) => (
            <option key={s.note} value={s.note} />
          ))}
        </datalist>
        <div className="flex gap-2">
          <label className="label min-w-0 flex-1">
            Amount
            <input className="input" placeholder="0.00" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label className="label">
            Currency
            <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {settings.currencies.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          {(currency === "BTC" || settings.baseCurrency === "BTC") && (
            <label className="label">
              Unit
              <button type="button" className="quiet" onClick={toggleUnit}>
                {unit}
              </button>
            </label>
          )}
        </div>
        <label className="label">
          Category
          <select className="input" value={categoryId} onChange={(e) => setCategoryId(Number(e.target.value) || "")}>
            <option value="">Category</option>
            <CategoryOptions categories={categories} />
          </select>
        </label>
        <div className="flex gap-2">
          <label className="label">
            Date
            <input className="input" type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="label min-w-0 flex-1">
            Tags
            <input className="input" placeholder="Comma separated" value={tags} onChange={(e) => setTags(e.target.value)} />
          </label>
        </div>
        {!editing && (
          <div className="flex flex-wrap items-end gap-2">
            <label className="label">
              Repeat
              <select className="input" value={repeat.period} onChange={(e) => setRepeat({ ...repeat, period: e.target.value })}>
                <option value="">Doesn't repeat</option>
                {["day", "week", "month", "year"].map((u) => (
                  <option key={u} value={u}>
                    Every {u}
                  </option>
                ))}
              </select>
            </label>
            {repeat.period && (
              <>
                <label className="label w-20">
                  Interval
                  <input
                    className="input"
                    type="number"
                    min="1"
                    value={repeat.every}
                    onChange={(e) => setRepeat({ ...repeat, every: e.target.value })}
                  />
                </label>
                <label className="label">
                  Ends
                  <input
                    className="input"
                    type="date"
                    value={repeat.endDate}
                    onChange={(e) => setRepeat({ ...repeat, endDate: e.target.value })}
                  />
                </label>
                <label className="flex h-10 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-accent"
                    checked={repeat.needsConfirmation}
                    onChange={(e) => setRepeat({ ...repeat, needsConfirmation: e.target.checked })}
                  />
                  Confirm each
                </label>
                <p className="w-full text-xs text-ink3">
                  Interval 2 means every second {repeat.period}. With Confirm each, every one waits as pending until you confirm it.
                </p>
              </>
            )}
          </div>
        )}
        {error && <p className="text-sm text-up">{error}</p>}
        {editing && (
          <button type="button" className="hit mt-4 self-start text-sm font-medium text-up" onClick={() => saving.mutate(["DELETE", `/api/expenses/${editing}`])}>
            Move to bin
          </button>
        )}
      </form>
    );

  if (view === "recurring")
    return (
      <>
        {back}
        <h1 className="mt-4 text-display font-bold">Recurring</h1>
        {templates.length === 0 && <p className="mt-4 text-ink3">Nothing repeats yet. Open the full form and set Repeat to add one.</p>}
        <ul className="mt-3">
          {templates.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-2 border-b border-line py-2.5 last:border-0">
              <button className="min-w-0 text-left" onClick={() => editTemplate(t)}>
                <span className="font-medium">{t.note}</span>
                <span className="block text-xs text-ink3">
                  {show(t.amount, t.currency)} every {t.every > 1 ? `${t.every} ${t.period}s` : t.period}
                  {t.paused && " · paused"}
                </span>
              </button>
              {asking === `stop ${t.id}` ? (
                <Confirm ask="Stop? Past expenses stay." yes="Stop" onYes={() => templateAction(t, "DELETE")} onNo={() => setAsking(null)} />
              ) : (
                <span className="flex gap-1">
                  <button className="quiet hit h-8 text-[13px]" onClick={() => templateAction(t, t.paused ? "resume" : "pause")}>
                    {t.paused ? "Resume" : "Pause"}
                  </button>
                  <button className="hit h-8 px-2 text-[13px] font-medium text-up" onClick={() => setAsking(`stop ${t.id}`)}>
                    Stop
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      </>
    );

  const days = new Map<string, Expense[]>();
  for (const e of [...queued.filter((e) => !filtered && e.date.startsWith(shown)), ...expenses].sort((a, b) => b.date.localeCompare(a.date)))
    if (e.status !== "pending") days.set(e.date, [...(days.get(e.date) ?? []), e]);
  const matching = [...days.values()].flat();
  const unrated = matching.filter((e) => e.baseAmount === null).length;
  const inBase = (rows: Expense[]) => rows.reduce((s, e) => s + (e.baseAmount ?? (e.currency === settings.baseCurrency ? e.amount : 0)), 0);
  const count = Object.values(filter).filter(Boolean).length;
  const heroButton = "press hit grid size-9 shrink-0 place-items-center rounded-chip bg-on-hero/16";

  return (
    <>
      <header className="-mx-5 -mt-[max(env(safe-area-inset-top),20px)] rounded-b-hero bg-hero px-5 pt-[max(env(safe-area-inset-top),16px)] pb-6 text-on-hero shadow-hero lg:mx-0 lg:mt-1 lg:rounded-hero [&_:focus-visible]:outline-on-hero">
        <div className="flex items-center gap-2">
          <h1 className="mr-auto min-w-0 text-display font-bold">{filtered ? "Filtered" : label}</h1>
          {!filtered && (
            <>
              <button aria-label="Previous month" className={heroButton} onClick={() => navigate({ search: { month: step(-1) } })}>
                <Chevron className="size-[18px] rotate-90 stroke-2" />
              </button>
              {month && (
                <button aria-label="Next month" className={heroButton} onClick={() => navigate({ search: { month: step(1) === today().slice(0, 7) ? undefined : step(1) } })}>
                  <Chevron className="size-[18px] -rotate-90 stroke-2" />
                </button>
              )}
            </>
          )}
          <button aria-label={count ? `Filters, ${count} on` : "Filters"} aria-expanded={showFilters} onClick={() => setShowFilters(!showFilters)} className={`${heroButton} relative ml-1.5`}>
            <Icon className="size-[18px] stroke-2">
              <path d="M4 7h16M7 12h10M10 17h4" />
            </Icon>
            {count > 0 && (
              <b className="num absolute -top-1 -right-1 grid size-[18px] place-items-center rounded-chip bg-on-hero text-[11px] font-semibold text-hero">{count}</b>
            )}
          </button>
        </div>
        {filtered ? (
          <>
            <p className="mt-5">
              <Total amount={inBase(matching)} currency={settings.baseCurrency} unit={unit} className="text-on-hero" />
            </p>
            <p className="mt-2.5 text-[13px] font-medium text-on-hero2">
              {matching.length} matching{unrated > 0 && ` + ${unrated} unconverted`}
            </p>
          </>
        ) : (
          <Summary unit={unit} end={month ? end : undefined} />
        )}
      </header>
      {showFilters && (
        <div className={`rise mt-4 grid grid-cols-2 gap-2 p-3 ${panel}`}>
          <div className="col-span-2 flex">{filterInput("q", "Search")}</div>
          {filterInput("from", "From", "date")}
          {filterInput("to", "To", "date")}
          <select className="input col-span-2 min-w-0" aria-label="Category" value={filter.category ?? ""} onChange={(e) => setFilter({ ...filter, category: e.target.value })}>
            <option value="">All categories</option>
            <CategoryOptions categories={categories} />
          </select>
          <select className="input min-w-0" aria-label="Currency" value={filter.currency ?? ""} onChange={(e) => setFilter({ ...filter, currency: e.target.value })}>
            <option value="">All currencies</option>
            {settings.currencies.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          {filterInput("tag", "Tag")}
          <div className="col-span-2 flex justify-between px-1 pt-1 text-[13px] font-medium">
            {filtered ? (
              <button className="hit text-ink2" onClick={() => setFilter({})}>
                Clear filters
              </button>
            ) : (
              <span />
            )}
            <a className="hit text-accent" href={`/api/export?${query}`} download="expenses.csv">
              Export CSV
            </a>
          </div>
        </div>
      )}
      {pending.length > 0 && (
        <ul className="mt-5 overflow-hidden rounded-panel bg-amber-soft">
          {pending.map((e) => (
            <li key={e.id} className={`relative flex h-[62px] items-center gap-3 px-4 ${divide} not-last:after:bg-amber-line!`}>
              <Tile category={categories.find((c) => c.id === e.categoryId)} />
              <button className="press min-w-0 flex-1 text-left" onClick={() => edit(e)}>
                <span className="block truncate font-medium">{e.note}</span>
                <span className="mt-0.5 block truncate text-xs font-medium text-amber">
                  <span className="num">{show(e.amount, e.currency)}</span> · due {dayLabel(e.date).replace(/^(Today|Yesterday)$/, (w) => w.toLowerCase())}
                </span>
              </button>
              <button
                className="press hit rounded-chip border border-amber-line bg-surface px-3 py-1.5 text-[13px] font-semibold text-amber"
                onClick={() => mutation.mutate(["POST", `/api/expenses/${e.id}/confirm`])}
              >
                Confirm
              </button>
            </li>
          ))}
        </ul>
      )}
      {listed && expenses.length + queued.length === 0 && (
        <div className={`mt-6 px-6 py-9 text-center ${panel}`}>
          <p className="font-semibold">{filtered ? "Nothing matches" : month ? `Nothing in ${label}` : "Nothing this month yet"}</p>
          <p className="mt-1 text-[13px] text-ink3">
            {filtered ? (
              <button className="hit font-medium text-accent" onClick={() => setFilter({})}>
                Clear filters
              </button>
            ) : month ? (
              "Step back a month, or add one below with a date."
            ) : (
              "Type one below, like “coffee 3.20”."
            )}
          </p>
        </div>
      )}
      {[...days].map(([date, rows]) => (
        <section key={date}>
          <h2 className="flex justify-between px-1 pt-6 pb-2 text-[13px] font-semibold text-ink2">
            {dayLabel(date)}
            {rows.length > 1 && (
              <span className="num font-medium text-ink3">
                {show(inBase(rows), settings.baseCurrency)}
                {rows.some((e) => e.baseAmount === null) && <span className="font-sans"> + {rows.filter((e) => e.baseAmount === null).length} unconverted</span>}
              </span>
            )}
          </h2>
          <ul className={panel}>
            {rows.map((e) => (
              <Fragment key={e.id}>
                <li className={`relative hover:bg-surface2 ${divide} ${e.id > newest.current! || e.id < 0 ? "grow-in" : ""}`}>
                  <div className={rowClass}>{row(e)}</div>
                </li>
                {asking === `rate ${e.id}` && (
                  <li>
                    <form onSubmit={(ev) => setRate(ev, e)} className="rise flex flex-wrap items-end gap-2 px-4 pb-4">
                      {[...new Set([e.currency, settings.baseCurrency])]
                        .filter((c) => c !== "USD")
                        .map((c) => (
                          <label key={c} className="label min-w-0 flex-1">
                            1 USD in {c}
                            <input name={c} className="input" inputMode="decimal" autoFocus={c === e.currency} />
                          </label>
                        ))}
                      <span className="flex w-full items-center justify-between text-[13px] font-medium">
                        <span className="text-up">{mutation.error?.message}</span>
                        <span>
                          <button type="button" className="hit rounded-chip px-2.5 py-1.5 text-ink2" onClick={() => setAsking(null)}>
                            Cancel
                          </button>
                          <button className="primary hit h-8 px-3 text-[13px]">Save</button>
                        </span>
                      </span>
                    </form>
                  </li>
                )}
              </Fragment>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

function Summary({ unit, end }: { unit: Unit; end?: Date }) {
  const s = span("This month", undefined, end);
  const now = usePeriod(s.range);
  const ref = usePeriod(end ? s.full : s.ref);
  const categories = useCategories();
  if (!now) return <div className="h-[92px]" />;
  const d = ref && change(now.total, ref.total);
  const share = (n: number) => `${Math.round((n / now.total) * 100)}%`;
  const builtin = (id: number) => categories.find((c) => c.id === id)?.builtin;
  return (
    <>
      <p className="mt-5">
        <Total amount={now.total} currency={now.baseCurrency} unit={unit} className="text-on-hero" />
      </p>
      <p className="mt-2.5 flex items-center gap-2 text-[13px] font-medium text-on-hero2">
        {d ? (
          <>
            <Pill d={d} />
            vs {s.name}
            {!end && " by today"}
          </>
        ) : (
          (end ? "all month" : "this month")
        )}
      </p>
      {now.total > 0 && (
        <>
          <div
            className="mt-5 flex h-2 gap-0.5"
            role="img"
            aria-label={`Spending by category: ${now.categories.map((c) => `${c.name} ${money(c.total, now.baseCurrency, unit)}, ${share(c.total)}`).join("; ")}`}
          >
            {now.categories.map((c, i) => (
              <i
                key={c.id}
                className={`min-w-1 origin-left animate-fill rounded-chip ${builtin(c.id) ? "bg-on-hero2/45" : ""}`}
                style={{ flex: c.total, background: builtin(c.id) ? undefined : c.color, animationDelay: `${i * 30}ms` }}
              />
            ))}
          </div>
          <p aria-hidden className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-on-hero2">
            {now.categories.slice(0, 3).map((c) => (
              <span key={c.id} className="inline-flex items-center gap-1.5">
                {builtin(c.id) ? (
                  <Icon className="size-3.5 stroke-2">
                    <circle cx="12" cy="12" r="7.5" strokeDasharray="3 3.3" />
                  </Icon>
                ) : (
                  c.icon
                )}
                <span className="text-on-hero">{c.name}</span>
                <span className="num">{share(c.total)}</span>
              </span>
            ))}
          </p>
        </>
      )}
    </>
  );
}
