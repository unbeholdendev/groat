import { type FormEvent, useContext, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useLocation } from "@tanstack/react-router";
import { formatAmount, parseAmount, type Unit } from "../../shared/amount";
import { change, money, span, Total, usePeriod } from "../period";
import {
  CategoryOptions,
  Chevron,
  dated,
  dayLabel,
  type Expense,
  FormContext,
  Icon,
  pick,
  today,
  UnitContext,
  useCategories,
  useSend,
  useSettings,
} from "../shared";

export const Route = createFileRoute("/")({
  validateSearch: (s) => pick(s, { q: /./, from: dated, to: dated, category: /^\d+$/, currency: /^\w+$/, tag: /./ }),
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
  const onForm = useContext(FormContext);
  const draft = useLocation().state.draft;
  const [showBin, setShowBin] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
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
  const filter = Route.useSearch();
  const navigate = Route.useNavigate();
  const setFilter = (search: typeof filter) => navigate({ search, replace: true });
  const noRepeat = { period: "", every: "1", endDate: "", needsConfirmation: false };
  const [repeat, setRepeat] = useState(noRepeat);
  const [template, setTemplate] = useState<number | null>(null);

  const query = new URLSearchParams(Object.entries(filter).filter(([, v]) => v));
  const expenses = useQuery<Expense[]>({ queryKey: ["/api/expenses?", query.toString()] }).data ?? [];
  const templates = useQuery<Template[]>({ queryKey: ["/api/recurring"] }).data ?? [];
  const bin = useQuery<Expense[]>({ queryKey: ["/api/bin"], enabled: showBin }).data;
  const suggestions =
    useQuery<Suggestion[]>({ queryKey: ["/api/notes?prefix=", encodeURIComponent(note)], enabled: open && !!note }).data ?? [];
  const mutation = useSend();
  const saving = useSend(reset);
  const error = saving.error?.message;

  useEffect(() => {
    if (!draft) return;
    edit({ ...draft, id: 0 }, null);
    navigate({ search: (prev) => prev, state: {}, replace: true });
  }, [draft]);
  useEffect(() => onForm(open), [open]);

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
    setOpen(false);
    setEditing(null);
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
    edit({ ...t, id: 0, date: t.startDate });
    setEditing(null);
    setTemplate(t.id);
    setRepeat({ period: t.period, every: String(t.every), endDate: t.endDate ?? "", needsConfirmation: t.needsConfirmation });
  }

  function templateAction(t: Template, action: string) {
    if (action === "DELETE" && !confirm("Stop this recurring expense? Expenses it created are kept.")) return;
    mutation.mutate(action === "DELETE" ? ["DELETE", `/api/recurring/${t.id}`] : ["POST", `/api/recurring/${t.id}/${action}`]);
  }

  function edit(e: Expense, id: number | null = e.id) {
    setOpen(true);
    setEditing(id);
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

  function remove() {
    if (confirm("Move this expense to the bin?")) saving.mutate(["DELETE", `/api/expenses/${editing}`]);
  }

  function emptyBin() {
    if (confirm("Permanently delete everything in the bin?")) mutation.mutate(["DELETE", "/api/bin"]);
  }

  async function setRate(e: Expense) {
    for (const c of new Set([e.currency, settings.baseCurrency].filter((c) => c !== "USD"))) {
      const rate = prompt(`1 USD = ? ${c} on ${e.date} (blank to keep)`);
      if (rate)
        await mutation
          .mutateAsync(["PUT", "/api/rates", { date: e.date, currency: c, rate }])
          .catch((err: Error) => alert(err.message));
    }
  }

  const row = (e: Expense) => {
    const category = categories.find((c) => c.id === e.categoryId);
    return (
      <>
        <span title={category?.name}>{category?.icon}</span>
        <span className="min-w-0 truncate font-medium">
          {e.note}
          {e.recurringId && (
            <span title={`Recurring: ${templates.find((t) => t.id === e.recurringId)?.note ?? "deleted"}`}>
              <Icon className="ml-1.5 inline size-3.5 align-[-2px] text-ink3">
                <path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4" />
              </Icon>
            </span>
          )}
          {e.tags.map((t) => (
            <span key={t} className="ml-1.5 text-[13px] font-normal text-ink3">
              #{t}
            </span>
          ))}
        </span>
        <span className="text-right font-medium">
          {show(e.amount, e.currency)}
          {e.currency !== settings.baseCurrency && e.baseAmount !== undefined && (
            <span className="block text-xs font-normal text-ink3">
              {e.baseAmount === null ? (
                <button
                  className="text-amber underline underline-offset-2"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    setRate(e);
                  }}
                >
                  Set rate
                </button>
              ) : (
                show(e.baseAmount, settings.baseCurrency)
              )}
            </span>
          )}
        </span>
      </>
    );
  };
  const rowClass = "grid grid-cols-[24px_1fr_auto] items-baseline gap-2.5 border-b border-line py-2.5 last:border-0";

  if (showBin && bin)
    return (
      <>
        <div className="flex items-center justify-between">
          <button className="inline-flex items-center gap-1 text-ink2" onClick={() => setShowBin(false)}>
            <Icon className="size-4 stroke-2">
              <path d="m15 6-6 6 6 6" />
            </Icon>
            Expenses
          </button>
          {bin.length > 0 && (
            <button className="text-sm font-medium text-up" onClick={emptyBin}>
              Empty bin
            </button>
          )}
        </div>
        <h1 className="mt-4 text-[22px] font-semibold tracking-tight">Bin</h1>
        {bin.length === 0 && <p className="mt-4 text-ink3">The bin is empty.</p>}
        <ul className="mt-3">
          {bin.map((e) => (
            <li key={e.id} className="flex items-center gap-3 border-b border-line last:border-0">
              <div className={`${rowClass} flex-1 border-0`}>{row(e)}</div>
              <button className="quiet h-8 text-[13px]" onClick={() => mutation.mutate(["POST", `/api/bin/${e.id}/restore`])}>
                Restore
              </button>
            </li>
          ))}
        </ul>
      </>
    );

  if (open)
    return (
      <form onSubmit={save} className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <button type="button" className="text-ink2" onClick={reset}>
            Cancel
          </button>
          <h1 className="text-[17px] font-semibold">{editing ? "Edit expense" : template ? "Edit recurring" : "New expense"}</h1>
          <button className="primary h-9" disabled={saving.isPending}>
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
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
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
              </>
            )}
          </div>
        )}
        {error && <p className="text-sm text-up">{error}</p>}
        {editing && (
          <button type="button" className="mt-4 self-start text-sm font-medium text-up" onClick={remove}>
            Move to bin
          </button>
        )}
      </form>
    );

  const pending = expenses.filter((e) => e.status === "pending");
  const days = new Map<string, Expense[]>();
  for (const e of expenses) if (e.status !== "pending") days.set(e.date, [...(days.get(e.date) ?? []), e]);
  const filtered = Object.values(filter).some(Boolean);

  return (
    <>
      <header className="flex items-baseline justify-between">
        <h1 className="text-[22px] font-semibold tracking-tight">
          Expenses <span className="text-sm font-medium text-ink3">{new Date().toLocaleDateString("en-GB", { month: "long" })}</span>
        </h1>
        <button
          aria-expanded={showFilters}
          onClick={() => setShowFilters(!showFilters)}
          className={`inline-flex items-center gap-1 text-sm font-medium ${filtered ? "text-accent" : "text-ink2"}`}
        >
          Filter{filtered && ` · ${Object.values(filter).filter(Boolean).length}`}
          <Chevron />
        </button>
      </header>
      {showFilters ? (
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          {filterInput("q", "Search")}
          <div className="flex w-full gap-2">
            {filterInput("from", "From", "date")}
            {filterInput("to", "To", "date")}
          </div>
          <select className="input min-w-0 flex-1" aria-label="Category" value={filter.category ?? ""} onChange={(e) => setFilter({ ...filter, category: e.target.value })}>
            <option value="">All categories</option>
            <CategoryOptions categories={categories} />
          </select>
          <select className="input" aria-label="Currency" value={filter.currency ?? ""} onChange={(e) => setFilter({ ...filter, currency: e.target.value })}>
            <option value="">All currencies</option>
            {settings.currencies.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <div className="flex w-full">{filterInput("tag", "Tag")}</div>
          <div className="flex w-full justify-between pt-1 text-[13px]">
            {filtered ? (
              <button className="text-ink2" onClick={() => setFilter({})}>
                Clear filters
              </button>
            ) : (
              <span />
            )}
            <a className="text-ink2 underline decoration-line2 underline-offset-3" href={`/api/export?${query}`} download="expenses.csv">
              Export CSV
            </a>
          </div>
        </div>
      ) : (
        <Summary unit={unit} />
      )}
      {pending.length > 0 && (
        <ul className="mt-5 border-y border-line">
          {pending.map((e) => (
            <li key={e.id} className="flex items-center gap-2.5 border-b border-line py-2.5 last:border-0">
              <span className="size-[7px] shrink-0 rounded-full bg-amber" />
              <button className="min-w-0 flex-1 truncate text-left text-sm" onClick={() => edit(e)}>
                {e.note} <span className="text-ink3">· {show(e.amount, e.currency)} · due {dayLabel(e.date).replace(/^(Today|Yesterday)$/, (w) => w.toLowerCase())}</span>
              </button>
              <button
                className="rounded-[7px] border border-amber-line px-2.5 py-1 text-[13px] font-medium text-amber"
                onClick={() => mutation.mutate(["POST", `/api/expenses/${e.id}/confirm`])}
              >
                Confirm
              </button>
            </li>
          ))}
        </ul>
      )}
      {expenses.length === 0 && (
        <p className="mt-10 text-center text-ink3">
          {filtered ? "No expenses match these filters." : "Nothing here yet. Type your first one below, like “coffee 3.20”."}
        </p>
      )}
      {[...days].map(([date, rows]) => (
        <section key={date}>
          <h2 className="flex justify-between pt-[22px] pb-1.5 text-[13px] font-medium text-ink3">
            <span className="text-ink2">{dayLabel(date)}</span>
            {show(
              rows.reduce((s, e) => s + (e.baseAmount ?? (e.currency === settings.baseCurrency ? e.amount : 0)), 0),
              settings.baseCurrency,
            )}
          </h2>
          <ul>
            {rows.map((e) => (
              <li
                key={e.id}
                tabIndex={0}
                className={`${rowClass} cursor-pointer`}
                onClick={() => edit(e)}
                onKeyDown={(ev) => ev.key === "Enter" && edit(e)}
              >
                {row(e)}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {templates.length > 0 && (
        <section className="mt-8">
          <h2 className="pb-1.5 text-[13px] font-medium text-ink2">Recurring</h2>
          <ul className="text-sm">
            {templates.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 border-b border-line py-2.5 last:border-0">
                <button className="min-w-0 text-left" onClick={() => editTemplate(t)}>
                  <span className="font-medium">{t.note}</span>
                  <span className="block text-xs text-ink3">
                    {show(t.amount, t.currency)} every {t.every > 1 ? `${t.every} ${t.period}s` : t.period}
                    {t.paused && " · paused"}
                  </span>
                </button>
                <span className="flex gap-1">
                  <button className="quiet h-8 text-[13px]" onClick={() => templateAction(t, t.paused ? "resume" : "pause")}>
                    {t.paused ? "Resume" : "Pause"}
                  </button>
                  <button className="h-8 px-2 text-[13px] font-medium text-up" onClick={() => templateAction(t, "DELETE")}>
                    Stop
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <button className="mt-8 text-[13px] text-ink3 underline decoration-line2 underline-offset-3" onClick={() => setShowBin(true)}>
        Bin
      </button>
    </>
  );
}

function Summary({ unit }: { unit: Unit }) {
  const s = span("This month");
  const now = usePeriod(s.range);
  const ref = usePeriod(s.ref);
  if (!now) return <div className="h-[86px]" />;
  const d = ref && change(now.total, ref.total);
  return (
    <section className="mt-3.5">
      <p className="flex items-baseline gap-2.5 text-ink2">
        <Total text={money(now.total, now.baseCurrency, unit)} />
        {d ? (
          <span>
            <span className={`font-medium ${d.tone}`}>{d.text}</span> vs {s.name} by now
          </span>
        ) : (
          <span>this month</span>
        )}
      </p>
      {now.total > 0 && (
        <>
          <div className="mt-3 flex h-[3px] gap-0.5" role="img" aria-label="Spending by category">
            {now.categories.map((c) => (
              <i key={c.id} className="rounded-sm" style={{ flex: c.total, background: c.color }} />
            ))}
          </div>
          <p className="mt-2 flex gap-3.5 overflow-hidden text-xs whitespace-nowrap text-ink3">
            {now.categories.slice(0, 4).map((c) => (
              <span key={c.id} className="inline-flex items-center gap-1.5">
                <i className="size-1.5 rounded-full" style={{ background: c.color }} />
                {c.name}
              </span>
            ))}
          </p>
        </>
      )}
    </section>
  );
}
