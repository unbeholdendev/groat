import { type PointerEvent, useEffect, useState } from "react";
import type { Unit } from "../../../shared/amount";
import { Icon } from "../../components/icon";
import { Pill, Total } from "../../components/total";
import { useCategories } from "../../lib/api";
import { dayLabel, today } from "../../lib/dates";
import { money } from "../../lib/money";
import { change, span, usePeriod } from "../../lib/period";
import type { Expense } from "../../lib/schemas";

export function Summary({ unit, end, rows, month }: { unit: Unit; end?: Date; rows: Expense[]; month: string }) {
  const s = span("This month", undefined, end);
  const now = usePeriod(s.range);
  const ref = usePeriod(end ? s.full : s.ref);
  const categories = useCategories();
  const [hover, setHover] = useState<string>();
  useEffect(() => setHover(undefined), [month]);
  if (!now) return <div className="h-[222px]" />;
  const d = ref && change(now.total, ref.total);
  const share = (n: number) => `${Math.round((n / now.total) * 100)}%`;
  const builtin = (id: number | null) => !id || categories.find((c) => c.id === id)?.builtin;
  const name = (id: number | null) => categories.find((c) => c.id === id)?.name ?? "Uncategorised";
  const colour = (id: number | null) => (builtin(id) ? undefined : categories.find((c) => c.id === id)?.color);
  const rank = (id: number | null) => now.categories.findIndex((c) => c.id === id) >>> 0;
  const rest = now.categories.slice(3);
  const parts = rest.length ? [...now.categories.slice(0, 3), { id: 0, name: "Other", total: rest.reduce((t, c) => t + c.total, 0) }] : now.categories;
  const dates = Array.from({ length: new Date(+month.slice(0, 4), +month.slice(5), 0).getDate() }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
  const days = dates.map((date) => {
    const spent = new Map<number | null, number>();
    for (const e of rows) if (e.date === date && e.baseAmount != null) spent.set(e.categoryId, (spent.get(e.categoryId) ?? 0) + e.baseAmount);
    return { date, unrated: rows.some((e) => e.date === date && e.baseAmount == null), total: [...spent.values()].reduce((a, b) => a + b, 0), parts: [...spent].sort(([a], [b]) => rank(a) - rank(b)) };
  });
  const max = Math.max(...days.map((day) => day.total));
  const shown = days.find((day) => day.date === hover);
  const selectDay = (e: PointerEvent<HTMLButtonElement>) => {
        const bounds = e.currentTarget.getBoundingClientRect();
        const index = Math.min(days.length - 1, Math.max(0, Math.floor((e.clientX - bounds.left) / bounds.width * days.length)));
        if (days[index].date <= today()) setHover(days[index].date);
      };
  return (
    <>
      <p className="mt-4">
        <Total amount={now.total} currency={now.baseCurrency} unit={unit} />
      </p>
      <p aria-live="polite" className="mt-2.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] font-medium text-ink2">
        {shown ? (
          <>
            {`${dayLabel(shown.date)} ·`}
            <span className="num text-ink">{money(shown.total, now.baseCurrency, unit)}</span>
            {shown.parts.map(([id, v]) => (
              <span key={id} className="text-ink3">
                {builtin(id) ? "" : categories.find((c) => c.id === id)?.icon} {shown.parts.length > 1 ? <span className="num">{money(v, now.baseCurrency, unit)}</span> : name(id)}
              </span>
            ))}
          </>
        ) : d ? (
          <>
            <Pill d={d} />
            vs {s.name}
            {!end && " by today"}
          </>
        ) : end ? (
          "all month"
        ) : (
          "this month"
        )}
      </p>
      <button type="button" aria-label="Show selected day's expenses" onClick={() => document.getElementById(`day-${hover ?? days.filter((day) => day.date <= today()).at(-1)?.date}`)?.scrollIntoView({ behavior: "smooth", block: "start" })} onPointerDown={selectDay} onPointerMove={selectDay} className="mt-5 grid h-28 w-full items-end gap-[3px] rounded-token focus-visible:outline-2 focus-visible:outline-accent" style={{ gridTemplateColumns: `repeat(${dates.length}, 1fr)` }}>
        {days.map((day, i) =>
          day.date > today() ? (
            <i key={day.date} aria-hidden className="mx-auto size-[3px] rounded-full bg-line2" />
          ) : day.total ? (
            <span key={day.date} aria-hidden
              className={`press flex origin-bottom animate-lift flex-col-reverse gap-px rounded-[3px] transition-opacity ${hover && hover !== day.date ? "opacity-35" : ""} ${day.date === today() ? "outline-[1.5px] outline-offset-2 outline-ink" : ""}`}
              style={{ height: `${(day.total / max) * 100}%`, animationDelay: `${i * 15}ms` }}
            >
              {day.parts.map(([id, v]) => (
                <i key={id} className={`min-h-0.5 rounded-[2.5px] ${colour(id) ? "" : "bg-ink3"}`} style={{ flex: v, background: colour(id) }} />
              ))}
            </span>
          ) : (
            <i key={day.date} aria-hidden className={`h-0.5 rounded-full ${day.unrated ? "bg-amber" : "bg-line2"} ${day.date === today() ? "outline-[1.5px] outline-offset-2 outline-ink" : ""}`} />
          ),
        )}
      </button>
      <p aria-hidden className="num mt-2 flex justify-between text-[11px] text-ink3">
        <span>1</span>
        <span>{dates.length}</span>
      </p>
      <label className="mt-3 flex items-center gap-3 text-[13px] text-ink2">
        Spending day
        <select aria-label="Spending day" value={hover ?? (end ? dates.at(-1) : today())} onChange={(e) => setHover(e.target.value)} className="min-h-11 min-w-0 flex-1 rounded-token bg-surface2 px-3 text-ink">
          {days.filter((day) => day.date <= today()).map((day) => <option key={day.date} value={day.date}>{dayLabel(day.date)} · {money(day.total, now.baseCurrency, unit)}</option>)}
        </select>
      </label>
      {now.total > 0 && (
        <p role="img" className="mt-3 flex flex-wrap gap-x-3.5 gap-y-1 text-xs font-medium text-ink2" aria-label={`By category: ${parts.map((c) => `${c.name} ${share(c.total)}`).join(", ")}`}>
          {parts.map((c) => (
            <span key={c.id} aria-hidden className="flex items-center gap-1.5">
              {c.id ? (
                <i className={`size-2 rounded-[2px] ${colour(c.id) ? "" : "bg-ink3"}`} style={{ background: colour(c.id) }} />
              ) : (
                <Icon d="M6 12h.01M12 12h.01M18 12h.01" className="size-3 stroke-[3]" />
              )}
              {c.name}
              <span className="num text-ink3">{share(c.total)}</span>
            </span>
          ))}
        </p>
      )}
    </>
  );
}
