import { panel } from "../../components/styles";
import { sign, trend } from "../../lib/period";
import type { Period } from "./types";

const rate = (p: Period) => (p.income.total ? (p.income.total - p.total) / p.income.total : null);

function Change({ now, before, points }: { now: number | null; before: number | null; points?: boolean }) {
  if (now === null || before === null || (!points && !before)) return null;
  const n = Math.round(points ? (now - before) * 100 : ((now - before) / Math.abs(before)) * 100);
  return (
    <span className={`num text-[12px] ${trend(n, "text-down", "text-up")}`}>
      {sign(n)}
      {Math.abs(n)}
      {points ? " pts" : "%"}
    </span>
  );
}

export function IncomeRow({ now, prev, show }: { now: Period; prev: Period; show: (n: number) => string }) {
  const compare = !now.unconverted && !prev.unconverted;
  const saved = now.unconverted ? null : rate(now);
  const cells = [
    { name: "Income", value: show(now.income.total), now: now.income.total, before: prev.income.total },
    {
      name: "Net",
      value: show(now.income.total - now.total),
      now: now.income.total - now.total,
      before: prev.income.total - prev.total,
    },
    {
      name: "Savings rate",
      value: saved === null ? "–" : `${Math.round(saved * 100)}%`,
      now: saved,
      before: rate(prev),
      points: true,
    },
  ];
  return (
    <dl className={`mt-6 grid grid-cols-3 ${panel}`}>
      {cells.map((c) => (
        <div key={c.name} className="flex min-w-0 flex-col gap-1 px-4 py-3 not-first:border-l not-first:border-line">
          <dt className="text-[12px] font-medium text-ink2">{c.name}</dt>
          <dd className="num truncate text-[15px] font-medium">{c.value}</dd>
          <dd>{compare && <Change now={c.now} before={c.before} points={c.points} />}</dd>
        </div>
      ))}
    </dl>
  );
}
