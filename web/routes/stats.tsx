import { createFileRoute, Link } from "@tanstack/react-router";
import { useContext, useId, useState } from "react";
import { change, days, money, Pill, span, Total, usePeriod } from "../period";
import { period, useApi, useCategories } from "../api";
import { Tile } from "../category";
import { dated, pick } from "../dates";
import { Chevron, divide, Icon, Segmented, UnitContext } from "../ui";

const presets = ["This month", "Last month", "Year to date", "Custom"] as const;


const group = (from: string, to: string) => {
  const n = days(from, to);
  return n <= 62 ? "day" : n <= 366 ? "week" : "month";
};
const useSeries = ([from, to]: [string, string]) =>
  useApi(period, [`/api/stats?from=${from}&to=${to}&group=${group(from, to)}`], { enabled: from <= to }).data;

export const Route = createFileRoute("/stats")({
  validateSearch: (s) => pick(s, { from: dated, to: dated }),
  component: StatsPage,
});

function StatsPage() {
  const [unit] = useContext(UnitContext);
  const { from, to } = Route.useSearch();
  const navigate = Route.useNavigate();
  const categories = useCategories();
  const [custom, setCustom] = useState(false);
  const range = from && to ? `${from},${to}` : span("This month").range.join();
  const preset = (!custom && presets.find((p) => p !== "Custom" && span(p).range.join() === range)) || "Custom";
  const [open, setOpen] = useState<number | null>(null);
  const [rangeFrom = "", rangeTo = ""] = range.split(",");
  const s = span(preset, [rangeFrom, rangeTo]);
  const setRange = (from: string, to: string) => navigate({ search: { from, to }, replace: true });
  const setPreset = (p: string) => {
    setCustom(p === "Custom");
    if (p !== "Custom") setRange(...span(p).range);
  };
  const now = useSeries(s.range);
  const ref = usePeriod(s.ref);
  const full = useSeries(s.full);
  const head = (
    <>
      <h1 className="text-display font-bold">Stats</h1>
      <div className="mt-4">
        <Segmented label="Period" options={presets} value={preset} onChange={(p) => (setPreset(p), setOpen(null))} />
      </div>
      {preset === "Custom" && (
        <div className="mt-3 flex gap-2">
          <label className="label min-w-0 flex-1">
            From
            <input className="input" type="date" value={s.range[0]} onChange={(e) => setRange(e.target.value, s.range[1])} />
          </label>
          <label className="label min-w-0 flex-1">
            To
            <input className="input" type="date" value={s.range[1]} onChange={(e) => setRange(s.range[0], e.target.value)} />
          </label>
        </div>
      )}
    </>
  );

  if (!now || !ref || !full)
    return (
      <>
        {head}
        <div className="mt-4 h-[302px] rounded-hero bg-hero shadow-hero" />
      </>
    );

  const show = (n: number) => money(n, now.baseCurrency, unit);
  const running = s.end > s.range[1];
  const n = days(...s.range);
  const vs = preset !== "Custom" ? s.name : n === 1 ? "the day before" : `the ${n} days before`;
  const d = change(now.total, ref.total);
  const before = (id: number, list: { id: number; total: number }[] = ref.categories) => list.find((c) => c.id === id)?.total ?? 0;
  const tile = (id: number) => categories.find((c) => c.id === id);
  const fresh = ref.total ? now.categories.filter((c) => !before(c.id) && !tile(c.id)?.builtin) : [];
  const list = (id: number) => ({ to: "/" as const, search: { category: String(id), from: s.range[0], to: s.range[1] } });
  const row = "flex w-full items-center gap-3 px-4 text-left hover:bg-surface2";

  return (
    <>
      {head}
      <section className="mt-4 rounded-hero bg-hero p-5 text-on-hero shadow-hero">
        <Total amount={now.total} currency={now.baseCurrency} unit={unit} className="block text-on-hero" />
        <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-medium text-on-hero2">
          {d ? (
            <>
              <Pill d={d} />
              vs {vs}
              {running && " by today"}
            </>
          ) : (
            `Nothing in ${vs}${running ? " by today" : ""}`
          )}
        </p>
        <Chart
          key={range}
          now={now.buckets}
          prev={full.buckets}
          range={s.range}
          end={s.end}
          full={s.full}
          max={Math.max(now.total, full.total)}
          label={`${s.name} ${show(full.total)}`}
          ghost={full.total > 0}
          aria={`${show(now.total)} ${running ? "so far" : "in total"}. ${preset === "Custom" ? "The period before" : s.name} was at ${show(ref.total)} by this point and ended at ${show(full.total)}.`}
        />
      </section>
      {now.unconverted > 0 && <p className="mt-3 text-[13px] text-amber">{now.unconverted === 1 ? "1 expense has no rate and is left out." : `${now.unconverted} expenses have no rate and are left out.`}</p>}

      <Head title="By category" vs={vs} />
      <ul className="overflow-hidden rounded-panel bg-surface shadow-panel">
        {now.categories.length === 0 && <li className="px-4 py-6 text-ink3">No spending in this period.</li>}
        {now.categories.map((c, i) => {
          const parent = ref.categories.find((p) => p.id === c.id)?.children;
          const subs = c.children.some((k) => k.id !== c.id);
          const t = tile(c.id);
          const cells = (
            <>
              <Tile category={t ?? c} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="truncate font-medium">{c.name}</span>
                  {subs && <Chevron className={`size-3.5 shrink-0 self-center text-ink3 transition-transform ${open === c.id ? "rotate-180" : ""}`} />}
                  <span className="num ml-auto">{show(c.total)}</span>
                  <Delta now={c.total} before={before(c.id)} pad={ref.total > 0} />
                </span>
                <span className="mt-2 flex items-center gap-2.5">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-chip bg-track">
                    <span
                      className="block h-full origin-left animate-fill rounded-chip"
                      style={{ width: `${(c.total / now.total) * 100}%`, background: t?.builtin ? "var(--ink3)" : c.color, animationDelay: `${i * 30}ms` }}
                    />
                  </span>
                  <span className="num w-9 text-right text-[12px] text-ink3">{Math.round((c.total / now.total) * 100)}%</span>
                </span>
              </span>
            </>
          );
          return (
            <li key={c.id} className={divide}>
              {subs ? (
                <button className={`${row} press py-3`} aria-expanded={open === c.id} onClick={() => setOpen(open === c.id ? null : c.id)}>
                  {cells}
                </button>
              ) : (
                <Link {...list(c.id)} className={`${row} press py-3`}>
                  {cells}
                </Link>
              )}
              {open === c.id && (
                <ul className="rise pb-1 pl-12">
                  {c.children.map((k) => {
                    const inner = (
                      <>
                        <Tile category={tile(k.id) ?? k} small />
                        <span className="min-w-0 flex-1 truncate">{k.id === c.id ? `${k.name}, general` : k.name}</span>
                        <span className="num">{show(k.total)}</span>
                        <Delta now={k.total} before={before(k.id, parent)} pad={ref.total > 0} />
                      </>
                    );
                    return (
                      <li key={k.id}>
                        {k.id === c.id ? (
                          <div className={`${row} h-12 hover:bg-transparent`}>{inner}</div>
                        ) : (
                          <Link {...list(k.id)} className={`${row} h-12`}>
                            {inner}
                          </Link>
                        )}
                      </li>
                    );
                  })}
                  <li>
                    <Link {...list(c.id)} className={`${row} h-12 text-[13px] font-medium text-accent`}>
                      All {c.name} expenses
                    </Link>
                  </li>
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      {fresh.length > 0 && (
        <p className="mt-2.5 px-1 text-[12px] font-medium text-ink3">
          New since {vs}: {fresh.map((c) => `${c.icon} ${c.name}`).join(", ")}
        </p>
      )}

      {now.tags.length > 0 && (
        <>
          <Head title="By tag" vs={vs} />
          <ul className="overflow-hidden rounded-panel bg-surface shadow-panel">
            {now.tags.map((t) => (
              <li key={t.name} className={divide}>
                <Link to="/" search={{ tag: t.name, from: s.range[0], to: s.range[1] }} className={`${row} press h-[62px]`}>
                  <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-tile bg-track text-ink3">
                    <Icon className="size-[18px] stroke-2">
                      <path d="M9 4 7 20M17 4l-2 16M4 9h16M3 15h16" />
                    </Icon>
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">{t.name}</span>
                  <span className="num">{show(t.total)}</span>
                  <Delta now={t.total} before={ref.tags.find((r) => r.name === t.name)?.total ?? 0} pad={ref.total > 0} />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function Head({ title, vs }: { title: string; vs: string }) {
  return (
    <div className="mt-7 mb-3 flex items-baseline justify-between px-1">
      <h2 className="text-[20px] font-[650] tracking-[-0.02em]">{title}</h2>
      <span className="text-[12px] font-medium text-ink3">vs {vs}</span>
    </div>
  );
}

function Delta({ now, before, pad }: { now: number; before: number; pad: boolean }) {
  const d = change(now, before);
  return (d || pad) && <span className={`num w-11 shrink-0 text-right text-[12px] ${d?.tone ?? ""}`}>{d?.text}</span>;
}

const H = 112;
const short = (d: string) => new Date(`${d}T00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

function cumulative(buckets: { start: string; total: number }[], [from, to]: [string, string]) {
  let sum = 0;
  const at = (d: string) => Math.max(0, days(from, d) - 1);
  return buckets.flatMap((b, i) => {
    const start = at(b.start);
    const end = i < buckets.length - 1 ? at(buckets[i + 1].start) : days(from, to);
    return [[start, sum], [end - start > 1 ? end : start, (sum += b.total)], [end, sum]];
  });
}

function Chart(props: {
  now: { start: string; total: number }[];
  prev: { start: string; total: number }[];
  range: [string, string];
  full: [string, string];
  end: string;
  max: number;
  label: string;
  ghost: boolean;
  aria: string;
}) {
  const id = `g${useId().replace(/\W/g, "")}`;
  const [w, setW] = useState(0);
  const measure = (el: HTMLDivElement) => {
    const o = new ResizeObserver(() => setW(el.clientWidth));
    o.observe(el);
    return () => o.disconnect();
  };
  const extent = Math.max(days(props.range[0], props.end), days(...props.full));
  const x = (n: number) => (n / extent) * w;
  const y = (v: number) => H - (v / (props.max || 1)) * (H - 20);
  const path = (pts: number[][]) => pts.map(([a, b], i) => `${i ? "L" : "M"}${x(a)},${y(b)}`).join("");
  const now = cumulative(props.now, props.range);
  const prev = cumulative(props.prev, props.full);
  const [ex, ey] = now[now.length - 1];
  const [, py] = prev[prev.length - 1];
  const running = props.end > props.range[1];
  const clash = x(ex) > w - 110 && Math.abs(y(ey) - y(py)) < 22;
  const above = !(clash && ey > py);

  return (
    <div className="mt-5">
      <div ref={measure} className="relative h-[112px]">
        {w > 0 && (
          <svg role="img" aria-label={props.aria} viewBox={`0 0 ${w} ${H}`} className="size-full overflow-visible">
            <defs>
              <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="white" stopOpacity="0.18" />
                <stop offset="1" stopColor="white" stopOpacity="0" />
              </linearGradient>
            </defs>
            <line x1="0" x2={w} y1={H} y2={H} className="stroke-white/20" />
            {props.ghost && <path d={path(prev)} fill="none" className="stroke-on-hero2 opacity-60" strokeWidth="1.5" strokeDasharray="4 4" strokeLinejoin="round" />}
            {running && <line x1={x(ex)} x2={x(ex)} y1="0" y2={H} className="stroke-white/30" />}
            <path d={`${path(now)}L${x(ex)},${H}L0,${H}Z`} fill={`url(#${id})`} className="animate-fade [animation-delay:200ms]" />
            <path d={path(now)} pathLength={1} fill="none" className="draw stroke-white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            {running && <circle cx={x(ex)} cy={y(ey)} r="5.5" strokeWidth="3" className="animate-fade fill-white stroke-hero [animation-delay:700ms]" />}
          </svg>
        )}
        {props.ghost && (
          <span
            aria-hidden
            className={`num absolute right-0 text-[11px] whitespace-nowrap text-on-hero2 ${above ? "-translate-y-[calc(100%+6px)]" : "translate-y-1.5"}`}
            style={{ top: y(py) }}
          >
            {props.label}
          </span>
        )}
      </div>
      <div aria-hidden className="num mt-2 flex justify-between text-[11px] text-on-hero2">
        <span>{short(props.range[0])}</span>
        <span>{short(props.end)}</span>
      </div>
    </div>
  );
}
