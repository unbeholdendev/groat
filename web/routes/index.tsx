import { type FormEvent, useContext, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useLocation } from "@tanstack/react-router";
import { formatAmount, parseAmount } from "../../shared/amount";
import { button, CategoryOptions, dated, type Expense, pick, UnitContext, useCategories, useSend, useSettings } from "../shared";

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

const today = () => new Date().toLocaleDateString("en-CA");

function Expenses() {
  const settings = useSettings()!;
  const [unit, setUnit] = useContext(UnitContext);
  const draft = useLocation().state.draft;
  const [showBin, setShowBin] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(settings.lastCurrency);
  const [date, setDate] = useState(today);
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [tags, setTags] = useState("");
  const show = (amount: number, c: string) => `${formatAmount(amount, c, unit)} ${c === "BTC" ? unit : c}`;

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
    useQuery<Suggestion[]>({ queryKey: ["/api/notes?prefix=", encodeURIComponent(note)], enabled: !!note }).data ?? [];
  const mutation = useSend();
  const saving = useSend(reset);
  const error = saving.error?.message;

  useEffect(() => {
    if (!draft) return;
    edit({ ...draft, id: 0 }, null);
    navigate({ search: (prev) => prev, state: {}, replace: true });
  }, []);

  function typeNote(value: string) {
    setNote(value);
    const match = suggestions.find((s) => s.note === value);
    if (match && !editing) {
      setAmount(formatAmount(match.amount, match.currency, unit));
      setCurrency(match.currency);
      setCategoryId(match.categoryId);
    }
  }

  const filterInput = (key: keyof typeof filter, placeholder: string, type = "text") => (
    <input
      className="input min-w-0 flex-1"
      type={type}
      placeholder={placeholder}
      value={filter[key] ?? ""}
      onChange={(e) => setFilter({ ...filter, [key]: e.target.value })}
    />
  );

  function reset() {
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
    setEditing(id);
    setNote(e.note);
    setAmount(formatAmount(e.amount, e.currency, unit));
    setCurrency(e.currency);
    setDate(e.date);
    setCategoryId(e.categoryId);
    setTags(e.tags.join(", "));
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
        <span className="flex items-center gap-2">
          <span className="rounded-full p-1.5 leading-none" style={{ background: `${category?.color}33` }} title={category?.name}>
            {category?.icon}
          </span>
          <span>
            {e.note}
            <span className="block text-xs text-zinc-500">
              {e.date}
              {e.recurringId && (
                <span className="ml-1" title={`Recurring: ${templates.find((t) => t.id === e.recurringId)?.note ?? "deleted"}`}>
                  🔁
                </span>
              )}
              {e.tags.map((t) => (
                <span key={t} className="ml-1 rounded bg-zinc-100 px-1 dark:bg-zinc-800">
                  #{t}
                </span>
              ))}
            </span>
          </span>
        </span>
        <span className="text-right tabular-nums">
          {show(e.amount, e.currency)}
          {e.status === "pending" && (
            <button
              className="block w-full text-right text-xs text-amber-600 underline"
              onClick={(ev) => {
                ev.stopPropagation();
                mutation.mutate(["POST", `/api/expenses/${e.id}/confirm`]);
              }}
            >
              Pending: confirm
            </button>
          )}
          {e.currency !== settings.baseCurrency && e.baseAmount !== undefined && (
            <span className="block text-xs text-zinc-500">
              {e.baseAmount === null ? (
                <button
                  className="underline"
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

  if (showBin && bin)
    return (
      <>
        <div className="flex justify-between">
          <button onClick={() => setShowBin(false)}>Back</button>
          {bin.length > 0 && (
            <button className="text-red-600" onClick={emptyBin}>
              Empty bin
            </button>
          )}
        </div>
        {bin.length === 0 && <p className="mt-6 text-zinc-500">The bin is empty.</p>}
        <ul className="mt-6 divide-y divide-zinc-200 dark:divide-zinc-800">
          {bin.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2 py-2">
              {row(e)}
              <button className="text-sm underline" onClick={() => mutation.mutate(["POST", `/api/bin/${e.id}/restore`])}>
                Restore
              </button>
            </li>
          ))}
        </ul>
      </>
    );

  return (
    <>
      <form onSubmit={save} className="flex flex-col gap-2">
        <input className="input" placeholder="Note" value={note} onChange={(e) => typeNote(e.target.value)} list="notes" autoFocus />
        <datalist id="notes">
          {suggestions.map((s) => (
            <option key={s.note} value={s.note} />
          ))}
        </datalist>
        <div className="flex gap-2">
          <input
            className="input min-w-0 flex-1"
            placeholder="0.00"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          {(currency === "BTC" || settings.baseCurrency === "BTC") && (
            <button type="button" className="input" onClick={toggleUnit}>
              {unit}
            </button>
          )}
          <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {settings.currencies.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <select className="input" value={categoryId} onChange={(e) => setCategoryId(Number(e.target.value) || "")}>
            <option value="">Category</option>
            <CategoryOptions categories={categories} />
          </select>
          <input
            className="input min-w-0 flex-1"
            placeholder="Tags, comma separated"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
        </div>
        {!editing && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <select className="input" value={repeat.period} onChange={(e) => setRepeat({ ...repeat, period: e.target.value })}>
              <option value="">Doesn't repeat</option>
              {["day", "week", "month", "year"].map((u) => (
                <option key={u} value={u}>
                  Every {u}
                </option>
              ))}
            </select>
            {repeat.period && (
              <>
                <input
                  className="input w-16"
                  type="number"
                  min="1"
                  aria-label="Interval"
                  value={repeat.every}
                  onChange={(e) => setRepeat({ ...repeat, every: e.target.value })}
                />
                <input
                  className="input"
                  type="date"
                  aria-label="End date"
                  value={repeat.endDate}
                  onChange={(e) => setRepeat({ ...repeat, endDate: e.target.value })}
                />
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={repeat.needsConfirmation}
                    onChange={(e) => setRepeat({ ...repeat, needsConfirmation: e.target.checked })}
                  />
                  Confirm each
                </label>
              </>
            )}
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className={button}>{editing || template ? "Save" : "Add"}</button>
        {template && (
          <button type="button" className="text-sm" onClick={reset}>
            Cancel
          </button>
        )}
        {editing && (
          <div className="flex justify-between text-sm">
            <button type="button" onClick={reset}>
              Cancel
            </button>
            <button type="button" className="text-red-600" onClick={remove}>
              Delete
            </button>
          </div>
        )}
      </form>
      <div className="mt-6 flex flex-wrap gap-2 text-sm">
        {filterInput("q", "Search")}
        {filterInput("from", "From", "date")}
        {filterInput("to", "To", "date")}
        <select className="input" value={filter.category ?? ""} onChange={(e) => setFilter({ ...filter, category: e.target.value })}>
          <option value="">All categories</option>
          <CategoryOptions categories={categories} />
        </select>
        <select className="input" value={filter.currency ?? ""} onChange={(e) => setFilter({ ...filter, currency: e.target.value })}>
          <option value="">All currencies</option>
          {settings.currencies.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        {filterInput("tag", "Tag")}
        <a className="self-center text-zinc-500 underline" href={`/api/export?${query}`} download="expenses.csv">
          Export CSV
        </a>
      </div>
      <ul className="mt-6 divide-y divide-zinc-200 dark:divide-zinc-800">
        {expenses.map((e) => (
          <li key={e.id} className="flex cursor-pointer justify-between py-2" onClick={() => edit(e)}>
            {row(e)}
          </li>
        ))}
      </ul>
      {templates.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 font-semibold">Recurring</h2>
          <ul className="divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            {templates.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 py-2">
                <button className="text-left" onClick={() => editTemplate(t)}>
                  {t.note}
                  <span className="block text-xs text-zinc-500">
                    {show(t.amount, t.currency)} every {t.every > 1 ? `${t.every} ${t.period}s` : t.period}
                    {t.paused && " (paused)"}
                  </span>
                </button>
                <span className="flex gap-3">
                  <button className="underline" onClick={() => templateAction(t, t.paused ? "resume" : "pause")}>
                    {t.paused ? "Resume" : "Pause"}
                  </button>
                  <button className="text-red-600" onClick={() => templateAction(t, "DELETE")}>
                    Delete
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <button className="mt-6 text-sm text-zinc-500 underline" onClick={() => setShowBin(true)}>
        Bin
      </button>
    </>
  );
}
