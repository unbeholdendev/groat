import { createFileRoute, Link } from "@tanstack/react-router";
import { useContext, useState } from "react";
import { change, days, money, span, Total, usePeriod } from "../period";
import { dated, pick, UnitContext } from "../shared";

const presets = ["This month", "Last month", "Year to date", "Custom"];

export const Route = createFileRoute("/stats")({
  validateSearch: (s) => pick(s, { from: dated, to: dated }),
  component: StatsPage,
});

function StatsPage() {
  const [unit] = useContext(UnitContext);
  const { from, to } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [custom, setCustom] = useState(false);
  const range = from && to ? `${from},${to}` : span("This month").range.join();
  const preset = (!custom && presets.find((p) => p !== "Custom" && span(p).range.join() === range)) || "Custom";
  const [open, setOpen] = useState<number | null>(null);
  const s = span(preset, range.split(",") as [string, string]);
  const setRange = (from: string, to: string) => navigate({ search: { from, to }, replace: true });
  const setPreset = (p: string) => {
    setCustom(p === "Custom");
    if (p !== "Custom") setRange(...span(p).range);
  };
  const now = usePeriod(s.range);
  const ref = usePeriod(s.ref);
  const full = usePeriod(s.full);
  const seg = (
    <div role="tablist" className="mt-4 flex gap-0.5 rounded-lg bg-track p-0.5">
      {presets.map((p) => (
        <button
          key={p}
          role="tab"
          aria-selected={preset === p}
          onClick={() => (setPreset(p), setOpen(null))}
          className={`hit h-8 flex-1 rounded-chip text-[13px] font-medium ${preset === p ? "bg-surface text-ink shadow-thumb" : "text-ink2"}`}
        >
          {p}
        </button>
      ))}
    </div>
  );

  if (!now || !ref || !full)
    return (
      <>
        <h1 className="text-[22px] font-semibold tracking-tight">Stats</h1>
        {seg}
        <div className="h-[260px]" />
      </>
    );

  const show = (n: number) => money(n, now.baseCurrency, unit);
  const delta = change(now.total, ref.total);
  const max = Math.max(full.total, now.total, 1);
  const pct = (n: number) => `${(n / max) * 100}%`;
  const top = Math.max(...now.categories.map((c) => c.total), 1);
  const before = (id: number, list: { id: number; total: number }[] = ref.categories) => list.find((c) => c.id === id)?.total ?? 0;
  const elapsed = days(s.range[0], s.range[1]);
  const length = days(s.range[0], s.end);
  const list = (id: number) => ({ to: "/" as const, search: { category: String(id), from: s.range[0], to: s.range[1] } });

  return (
    <>
      <h1 className="text-[22px] font-semibold tracking-tight">Stats</h1>
      {seg}
      {preset === "Custom" && (
        <div className="mt-3 flex gap-2">
          <input className="input min-w-0 flex-1" type="date" aria-label="From" value={s.range[0]} onChange={(e) => setRange(e.target.value, s.range[1])} />
          <input className="input min-w-0 flex-1" type="date" aria-label="To" value={s.range[1]} onChange={(e) => setRange(s.range[0], e.target.value)} />
        </div>
      )}

      <p className="mt-4 flex items-baseline gap-2.5 text-ink2">
        <Total text={show(now.total)} />
        {delta && (
          <span>
            <span className={`font-medium ${delta.tone}`}>{delta.text}</span> vs {s.name}
            {length > elapsed && " by now"}
          </span>
        )}
      </p>
      {now.unconverted > 0 && <p className="mt-1 text-sm text-amber">{now.unconverted === 1 ? "1 expense has no rate and is left out." : `${now.unconverted} expenses have no rate and are left out.`}</p>}

      <div
        className={`relative ${length > elapsed ? "mt-12" : "mt-5"}`}
        role="img"
        aria-label={`${show(now.total)} so far. ${s.name} was at ${show(ref.total)} by this point and ended at ${show(full.total)}.`}
      >
        <div className="h-2 overflow-hidden rounded bg-track">
          <div className="h-full rounded bg-accent" style={{ width: pct(now.total) }} />
        </div>
        {length > elapsed && (
          <>
            <span className="absolute -top-1 h-4 w-0.5 rounded bg-ink" style={{ left: pct(ref.total) }} />
            <Label
              className="absolute bottom-full mb-2.5 -translate-x-1/2 text-center text-xs text-ink3"
              style={{ left: `${Math.min(Math.max((ref.total / max) * 100, 14), 86)}%` }}
              title={`${s.name} by now`}
              value={show(ref.total)}
            />
          </>
        )}
        <div className="mt-2.5 flex justify-between text-xs text-ink3">
          <Label title={length > elapsed ? "So far" : "Total"} value={show(now.total)} />
          <Label className="text-right" title={`${s.name} total`} value={show(full.total)} />
        </div>
      </div>
      {length > elapsed && (
        <>
          <p className="mt-5 text-[13px] text-ink3">
            Day {elapsed} of {length}
          </p>
          <div className="mt-1.5 h-1 overflow-hidden rounded-sm bg-track">
            <div className="h-full bg-ink3" style={{ width: `${(elapsed / length) * 100}%` }} />
          </div>
        </>
      )}

      <div className="mt-7 mb-1 flex justify-between text-[13px] font-medium text-ink3">
        <span className="text-ink2">By category</span>
        <span>vs {s.name}</span>
      </div>
      {now.categories.length === 0 && <p className="py-6 text-ink3">No spending in this period.</p>}
      <ul>
        {now.categories.map((c) => {
          const parent = ref.categories.find((p) => p.id === c.id)?.children;
          const subs = c.children.some((k) => k.id !== c.id);
          const cells = (
            <>
              <span>{c.icon}</span>
              <span className="font-medium">{c.name}</span>
              <span className="font-medium">{show(c.total)}</span>
              <Delta now={c.total} before={before(c.id)} />
              <span className="col-span-2 col-start-2 h-1 overflow-hidden rounded-sm bg-track">
                <span className="block h-full rounded-sm" style={{ width: `${(c.total / top) * 100}%`, background: c.color }} />
              </span>
            </>
          );
          const rowClass = "grid w-full grid-cols-[24px_1fr_auto_48px] items-baseline gap-x-2.5 gap-y-1.5 py-2.5 text-left";
          return (
            <li key={c.id} className="border-b border-line last:border-0">
              {subs ? (
                <button className={rowClass} aria-expanded={open === c.id} onClick={() => setOpen(open === c.id ? null : c.id)}>
                  {cells}
                </button>
              ) : (
                <Link {...list(c.id)} className={rowClass}>
                  {cells}
                </Link>
              )}
              {open === c.id && (
                <ul className="mb-2 ml-[34px] border-l border-line2 pl-3 text-sm text-ink2">
                  {c.children.map((k) =>
                    k.id === c.id ? (
                      <li key={k.id} className="flex justify-between gap-2 py-1.5">
                        {k.name}, general
                        <span className="flex gap-3">
                          {show(k.total)}
                          <Delta now={k.total} before={before(k.id, parent)} />
                        </span>
                      </li>
                    ) : (
                      <li key={k.id}>
                        <Link {...list(k.id)} className="flex justify-between gap-2 py-1.5">
                          {k.icon} {k.name}
                          <span className="flex gap-3">
                            {show(k.total)}
                            <Delta now={k.total} before={before(k.id, parent)} />
                          </span>
                        </Link>
                      </li>
                    ),
                  )}
                  <li>
                    <Link {...list(c.id)} className="block py-1.5 font-medium text-accent">
                      All {c.name} expenses
                    </Link>
                  </li>
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      {now.tags.length > 0 && (
        <>
          <div className="mt-7 mb-1 flex justify-between text-[13px] font-medium text-ink3">
            <span className="text-ink2">By tag</span>
            <span>vs {s.name}</span>
          </div>
          <ul>
            {now.tags.map((t) => (
              <li key={t.name} className="border-b border-line last:border-0">
                <Link
                  to="/"
                  search={{ tag: t.name, from: s.range[0], to: s.range[1] }}
                  className="grid w-full grid-cols-[24px_1fr_auto_48px] items-baseline gap-x-2.5 py-2.5"
                >
                  <span className="text-ink3">#</span>
                  <span className="truncate font-medium">{t.name}</span>
                  <span className="font-medium">{show(t.total)}</span>
                  <Delta now={t.total} before={ref.tags.find((r) => r.name === t.name)?.total ?? 0} />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function Label({ title, value, className = "", style }: { title: string; value: string; className?: string; style?: object }) {
  return (
    <span className={`whitespace-nowrap ${className}`} style={style}>
      {title}
      <b className="block text-[13px] font-medium text-ink">{value}</b>
    </span>
  );
}

function Delta({ now, before }: { now: number; before: number }) {
  const d = change(now, before);
  return <span className={`w-12 text-right text-[13px] ${d?.tone ?? "text-ink3"}`}>{d?.text ?? "new"}</span>;
}
