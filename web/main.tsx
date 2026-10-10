import { type FormEvent, Fragment, lazy, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { keepPreviousData, MutationCache, QueryClient, QueryClientProvider, useMutation, useQuery } from "@tanstack/react-query";
import { formatAmount, parseAmount, type Unit } from "../shared/amount";
import "./index.css";
import { ChatPage, type Draft } from "./chat";

const StatsPage = lazy(() => import("./stats"));

type Expense = {
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
type Template = Omit<Expense, "date"> & {
  period: string;
  every: number;
  startDate: string;
  endDate: string | null;
  needsConfirmation: boolean;
  paused: boolean;
};
type Category = { id: number; name: string; icon: string; color: string; parentId: number | null; builtin: boolean };
type Tag = { id: number; name: string };
type Suggestion = { note: string; categoryId: number; currency: string; amount: number };
type Settings = {
  baseCurrency: string;
  currencies: string[];
  lastCurrency: string;
  theme: "system" | "light" | "dark";
  onboarded: boolean;
  ai: boolean;
};

const today = () => new Date().toLocaleDateString("en-CA");
const button = "rounded-lg bg-zinc-900 py-2 text-white dark:bg-zinc-100 dark:text-zinc-900";

type Request = [method: string, path: string, body?: unknown];
async function send(...[method, path, body]: Request) {
  const res = await fetch(path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error);
  return json;
}
const useSend = (onSuccess?: () => void) => useMutation({ mutationFn: (r: Request) => send(...r), onSuccess });

const queryClient: QueryClient = new QueryClient({
  defaultOptions: {
    queries: { queryFn: ({ queryKey }) => fetch(queryKey.join("")).then((r) => r.json()), placeholderData: keepPreviousData },
  },
  mutationCache: new MutationCache({ onSuccess: saved }),
});

function saved(data: unknown, variables: unknown) {
  if (!Array.isArray(variables)) return refresh("/api/chats");
  const [method, path] = variables as Request;
  if (!/^\/api\/(expenses|bin)\/\d+/.test(path) && !(method === "POST" && path === "/api/expenses"))
    return queryClient.invalidateQueries();
  const row = data as Expense;
  const gone = method === "DELETE";
  for (const [key, rows] of queryClient.getQueriesData<Expense[]>({ queryKey: ["/api/expenses?"] })) {
    if (!rows) continue;
    if (key[1] && !gone) queryClient.invalidateQueries({ queryKey: key, exact: true });
    else
      queryClient.setQueryData(
        key,
        [...rows.filter((r) => r.id !== row.id), ...(gone ? [] : [row])].sort(
          (a, b) => b.date.localeCompare(a.date) || b.id - a.id,
        ),
      );
  }
  ["/api/settings", "/api/tags", "/api/notes", "/api/bin", "/api/stats"].forEach(refresh);
}

const refresh = (prefix: string) =>
  queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith(prefix) });

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

function App() {
  const { data: settings } = useQuery<Settings>({ queryKey: ["/api/settings"] });
  const [page, setPage] = useState<"expenses" | "stats" | "chat" | "categories" | "settings">("expenses");
  const [unit, setUnit] = useState<Unit>("BTC");
  const [draft, setDraft] = useState<Draft | null>(null);
  useTheme(settings?.theme);

  if (!settings) return null;
  if (!settings.onboarded)
    return <SettingsForm settings={settings} path="/api/onboarding" method="POST" title="Welcome" />;
  return (
    <main className="mx-auto max-w-md p-4">
      <nav className="mb-4 flex gap-4 text-sm">
        {(["expenses", "stats", ...(settings.ai ? (["chat"] as const) : []), "categories", "settings"] as const).map((p) => (
          <button key={p} onClick={() => (setPage(p), setDraft(null))} className={`capitalize ${page === p ? "font-semibold" : "text-zinc-500"}`}>
            {p}
          </button>
        ))}
      </nav>
      {page === "expenses" ? (
        <Expenses settings={settings} unit={unit} setUnit={setUnit} draft={draft} />
      ) : page === "stats" ? (
        <Suspense>
          <StatsPage unit={unit} />
        </Suspense>
      ) : page === "chat" ? (
        <ChatPage onDraft={(d) => (setDraft(d), setPage("expenses"))} />
      ) : page === "categories" ? (
        <Categories />
      ) : (
        <SettingsForm settings={settings} path="/api/settings" method="PUT" title="Settings" />
      )}
    </main>
  );
}

function SettingsForm(props: {
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

function Expenses({
  settings,
  unit,
  setUnit,
  draft,
}: { settings: Settings; unit: Unit; setUnit: (u: Unit) => void; draft: Draft | null }) {
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
  const [filter, setFilter] = useState<Record<string, string>>({});
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
    if (draft) edit({ ...draft, id: 0 }, null);
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

  const filterInput = (key: string, placeholder: string, type = "text") => (
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

const useCategories = () => useQuery<Category[]>({ queryKey: ["/api/categories"] }).data ?? [];

function CategoryOptions({ categories, except }: { categories: Category[]; except?: number }) {
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

function Categories() {
  const categories = useCategories();
  const tags = useQuery<Tag[]>({ queryKey: ["/api/tags"] }).data ?? [];
  const [deleting, setDeleting] = useState<number | null>(null);
  const [moveTo, setMoveTo] = useState("");
  const [draft, setDraft] = useState({ name: "", icon: "📁", color: "#71717a", parentId: "" });
  const { mutate: call, error } = useSend();

  const update = (id: number, field: string, value: string) => call(["PUT", `/api/categories/${id}`, { [field]: value }]);

  function move(c: Category, by: number) {
    const ids = categories.filter((s) => s.parentId === c.parentId).map((s) => s.id);
    const i = ids.indexOf(c.id);
    if (i + by < 0 || i + by >= ids.length) return;
    [ids[i], ids[i + by]] = [ids[i + by], ids[i]];
    call(["PUT", "/api/categories/order", ids]);
  }

  function remove(id: number) {
    setDeleting(null);
    setMoveTo("");
    call(["DELETE", `/api/categories/${id}${moveTo ? `?moveTo=${moveTo}` : ""}`]);
  }

  function add(e: FormEvent) {
    e.preventDefault();
    call(["POST", "/api/categories", { ...draft, parentId: Number(draft.parentId) || null }]);
    setDraft({ ...draft, name: "" });
  }

  function renameTag(t: Tag) {
    const name = prompt("Rename tag", t.name);
    if (name) call(["PUT", `/api/tags/${t.id}`, { name }]);
  }

  function deleteTag(t: Tag) {
    if (confirm(`Delete #${t.name}? It will be removed from every expense.`))
      call(["DELETE", `/api/tags/${t.id}`]);
  }

  const tree = categories
    .filter((p) => p.parentId === null)
    .flatMap((p) => [p, ...categories.filter((c) => c.parentId === p.id)]);

  return (
    <div className="flex flex-col gap-6">
      {error && <p className="text-sm text-red-600">{error.message}</p>}
      <ul className="flex flex-col gap-1">
        {tree.map((c) => (
          <li key={c.id} className={`flex flex-wrap items-center gap-1 ${c.parentId ? "pl-6" : ""}`}>
            <input className="input w-12 px-1 text-center" defaultValue={c.icon} onBlur={(e) => update(c.id, "icon", e.target.value)} />
            <input className="input min-w-0 flex-1" defaultValue={c.name} onBlur={(e) => update(c.id, "name", e.target.value)} />
            <input type="color" className="h-9 w-9" defaultValue={c.color} onBlur={(e) => update(c.id, "color", e.target.value)} />
            <button onClick={() => move(c, -1)} aria-label="Move up">↑</button>
            <button onClick={() => move(c, 1)} aria-label="Move down">↓</button>
            {!c.builtin && (
              <button className="text-red-600" onClick={() => setDeleting(c.id)} aria-label="Delete">
                ✕
              </button>
            )}
            {deleting === c.id && (
              <div className="flex w-full items-center gap-2 text-sm">
                Move its expenses to
                <select className="input" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                  <option value="">Uncategorised</option>
                  <CategoryOptions categories={categories} except={c.id} />
                </select>
                <button className="text-red-600" onClick={() => remove(c.id)}>
                  Delete
                </button>
                <button onClick={() => setDeleting(null)}>Cancel</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="flex flex-wrap gap-1">
        <input className="input w-12 px-1 text-center" value={draft.icon} onChange={(e) => setDraft({ ...draft, icon: e.target.value })} />
        <input
          className="input min-w-0 flex-1"
          placeholder="New category"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
        <input type="color" className="h-9 w-9" value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })} />
        <select className="input" value={draft.parentId} onChange={(e) => setDraft({ ...draft, parentId: e.target.value })}>
          <option value="">Top level</option>
          {categories
            .filter((p) => p.parentId === null)
            .map((p) => (
              <option key={p.id} value={p.id}>
                in {p.name}
              </option>
            ))}
        </select>
        <button className={`${button} px-4`}>Add</button>
      </form>
      <section>
        <h2 className="mb-2 font-semibold">Tags</h2>
        {tags.length === 0 && <p className="text-sm text-zinc-500">No tags yet.</p>}
        <ul className="flex flex-wrap gap-2 text-sm">
          {tags.map((t) => (
            <li key={t.id} className="flex gap-1 rounded bg-zinc-100 px-2 py-1 dark:bg-zinc-800">
              <button onClick={() => renameTag(t)}>#{t.name}</button>
              <button className="text-red-600" onClick={() => deleteTag(t)} aria-label="Delete tag">
                ✕
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>,
);
navigator.serviceWorker?.register("/sw.js");
