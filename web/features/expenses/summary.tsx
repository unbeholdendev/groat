import type { Unit } from "../../../shared/amount";
import { Icon } from "../../components/icon";
import { Pill, Total } from "../../components/total";
import { useCategories } from "../../lib/api";
import { money } from "../../lib/money";
import { change, span, usePeriod } from "../../lib/period";

export function Summary({ unit, end }: { unit: Unit; end?: Date }) {
  const s = span("This month", undefined, end);
  const now = usePeriod(s.range);
  const ref = usePeriod(end ? s.full : s.ref);
  const categories = useCategories();
  if (!now) return <div className="h-[92px]" />;
  const d = ref && change(now.total, ref.total);
  const share = (n: number) => `${Math.round((n / now.total) * 100)}%`;
  const builtin = (id: number) => categories.find((c) => c.id === id)?.builtin;
  const rest = now.categories.slice(3);
  const parts = rest.length
    ? [...now.categories.slice(0, 3), { id: 0, name: "Other", icon: "", color: "", total: rest.reduce((t, c) => t + c.total, 0) }]
    : now.categories;
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
        ) : end ? (
          "all month"
        ) : (
          "this month"
        )}
      </p>
      {now.total > 0 && (
        <>
          <div
            className="mt-5 flex h-2 gap-0.5"
            role="img"
            aria-label={`Spending by category: ${parts.map((c) => `${c.name} ${money(c.total, now.baseCurrency, unit)}, ${share(c.total)}`).join("; ")}`}
          >
            {parts.map((c, i) => (
              <i
                key={c.id}
                className={`min-w-1 origin-left animate-fill rounded-chip ${!c.id ? "bg-on-hero/20" : builtin(c.id) ? "bg-on-hero2/45" : ""}`}
                style={{ flex: c.total, background: builtin(c.id) ? undefined : c.color, animationDelay: `${i * 30}ms` }}
              />
            ))}
          </div>
          <p aria-hidden className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs font-medium text-on-hero2">
            {parts.map((c) => (
              <span key={c.id} className="flex min-w-0 items-center gap-1.5">
                {!c.id ? (
                  <Icon d="M6 12h.01M12 12h.01M18 12h.01" className="size-3.5 stroke-[3]" />
                ) : builtin(c.id) ? (
                  <Icon className="size-3.5 stroke-2">
                    <circle cx="12" cy="12" r="7.5" strokeDasharray="3 3.3" />
                  </Icon>
                ) : (
                  c.icon
                )}
                <span className="truncate text-on-hero">{c.name}</span>
                <span className="num">{share(c.total)}</span>
              </span>
            ))}
          </p>
        </>
      )}
    </>
  );
}
