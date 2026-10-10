import { AnimatePresence, motion } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useContext, useState } from "react";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { formatAmount } from "../../shared/amount";
import { dated, pick, UnitContext } from "../shared";

type Slice = { id: number; name: string; icon: string; color: string; total: number };
type Category = Slice & { children: Slice[] };
type Period = {
  from: string;
  to: string;
  baseCurrency: string;
  total: number;
  unconverted: number;
  categories: Category[];
  buckets: { start: string; total: number }[];
};
type Stats = Period & { previous: Period };

const iso = (d: Date) => d.toLocaleDateString("en-CA");

function presets() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  return {
    "This month": [iso(new Date(y, m, 1)), iso(now)],
    "Last month": [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))],
    "Year to date": [iso(new Date(y, 0, 1)), iso(now)],
  } as Record<string, [string, string]>;
}

function Change({ now, before }: { now: number; before: number }) {
  if (!before) return null;
  const pct = Math.round(((now - before) / before) * 100);
  return (
    <span className={`text-xs ${pct > 0 ? "text-red-600" : "text-green-600"}`}>
      {pct > 0 ? "▲" : "▼"} {Math.abs(pct)}%
    </span>
  );
}

function ChartTip({ active, payload, label, money }: { active?: boolean; payload?: { value: number; name: string }[]; label?: string; money: (n: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg bg-white px-2 py-1 text-sm shadow dark:bg-zinc-800">
      {label ?? payload[0].name}: {money(payload[0].value)}
    </div>
  );
}

export const Route = createFileRoute("/stats")({
  validateSearch: (s) => pick(s, { from: dated, to: dated, group: /^(day|week|month)$/ }),
  component: StatsPage,
});

function StatsPage() {
  const [unit] = useContext(UnitContext);
  const [thisFrom, thisTo] = presets()["This month"];
  const { from = thisFrom, to = thisTo, group = "day" } = Route.useSearch();
  const range = [from, to];
  const navigate = Route.useNavigate();
  const setSearch = (s: { from?: string; to?: string; group?: string }) =>
    navigate({ search: (prev) => ({ ...prev, ...s }), replace: true });
  const setRange = ([from, to]: string[]) => setSearch({ from, to });
  const [custom, setCustom] = useState(false);
  const preset = (!custom && Object.entries(presets()).find(([, r]) => r[0] === from && r[1] === to)?.[0]) || "Custom";
  const [drill, setDrill] = useState<number | null>(null);

  const { data: stats } = useQuery<Stats>({
    queryKey: [`/api/stats?from=${range[0]}&to=${range[1]}&group=${group}`],
    enabled: range[0] <= range[1],
  });

  if (!stats) return null;
  const base = stats.baseCurrency;
  const money = (n: number) => `${formatAmount(n, base, unit)} ${base === "BTC" ? unit : base}`;
  const parent = stats.categories.find((c) => c.id === drill);
  const previousOf = (id: number) => {
    const all = stats.previous.categories;
    return (parent ? all.find((c) => c.id === parent.id)?.children : all)?.find((c) => c.id === id)?.total ?? 0;
  };
  const slices = parent
    ? parent.children.map((c) => ({ ...c, name: c.id === parent.id ? `${c.name} (general)` : c.name }))
    : stats.categories;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2 text-sm">
        {[...Object.keys(presets()), "Custom"].map((p) => (
          <button
            key={p}
            className={`rounded-full px-3 py-1 ${preset === p ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "bg-zinc-100 dark:bg-zinc-800"}`}
            onClick={() => {
              setCustom(p === "Custom");
              if (p !== "Custom") setRange(presets()[p]);
            }}
          >
            {p}
          </button>
        ))}
      </div>
      {preset === "Custom" && (
        <div className="flex gap-2">
          <input className="input min-w-0 flex-1" type="date" value={range[0]} onChange={(e) => setRange([e.target.value, range[1]])} />
          <input className="input min-w-0 flex-1" type="date" value={range[1]} onChange={(e) => setRange([range[0], e.target.value])} />
        </div>
      )}

      <div>
        <p className="text-3xl font-semibold tabular-nums">{money(stats.total)}</p>
        <p className="flex items-center gap-2 text-sm text-zinc-500">
          vs {money(stats.previous.total)} the previous {Math.round((Date.parse(stats.to) - Date.parse(stats.from)) / 864e5) + 1} days
          <Change now={stats.total} before={stats.previous.total} />
        </p>
        {stats.unconverted > 0 && (
          <p className="text-sm text-amber-600">{stats.unconverted} expenses have no rate and are left out.</p>
        )}
      </div>

      <section>
        {parent && (
          <button className="mb-2 text-sm text-zinc-500" onClick={() => setDrill(null)}>
            ← All categories
          </button>
        )}
        {slices.length > 0 && (
          <div className="h-56">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="total"
                  nameKey="name"
                  innerRadius="60%"
                  outerRadius="90%"
                  paddingAngle={2}
                  stroke="none"
                  onClick={(_, i) => !parent && setDrill(slices[i].id)}
                >
                  {slices.map((s, i) => (
                    <Cell key={s.id} fill={s.color} fillOpacity={parent ? 1 - i * 0.15 : 1} className="cursor-pointer outline-none" />
                  ))}
                </Pie>
                <Tooltip content={<ChartTip money={money} />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          <AnimatePresence initial={false}>
            {slices.map((s) => (
              <motion.li
                key={`${drill}-${s.id}`}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`flex items-center justify-between py-2 ${parent ? "" : "cursor-pointer"}`}
                onClick={() => !parent && setDrill(s.id)}
              >
                <span className="flex items-center gap-2">
                  <span className="rounded-full p-1.5 leading-none" style={{ background: `${s.color}33` }}>
                    {s.icon}
                  </span>
                  {s.name}
                </span>
                <span className="flex items-center gap-2 tabular-nums">
                  <Change now={s.total} before={previousOf(s.id)} />
                  {money(s.total)}
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
        {slices.length === 0 && <p className="text-sm text-zinc-500">No spending in this range.</p>}
      </section>

      <section>
        <div className="mb-2 flex gap-3 text-sm">
          {(["day", "week", "month"] as const).map((g) => (
            <button key={g} className={`capitalize ${group === g ? "font-semibold" : "text-zinc-500"}`} onClick={() => setSearch({ group: g })}>
              {g}
            </button>
          ))}
        </div>
        <div className="h-48 text-zinc-500">
          <ResponsiveContainer>
            <BarChart data={stats.buckets}>
              <XAxis dataKey="start" tick={{ fill: "currentColor", fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip cursor={{ fill: "currentColor", fillOpacity: 0.1 }} content={<ChartTip money={money} />} />
              <Bar dataKey="total" radius={[4, 4, 0, 0]} className="fill-zinc-900 dark:fill-zinc-100" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
