import { useContext } from "react";
import { panel } from "../../components/styles";
import { useSettings } from "../../lib/api";
import { dayLabel } from "../../lib/dates";
import { money } from "../../lib/money";
import type { Transaction } from "../../lib/schemas";
import { UnitContext } from "../../lib/unit";
import { inBase, useKindOf } from "./queries";
import { useMonth } from "./use-month";
import { SwipeRow } from "./swipe-row";

export function DayList({ days, newest }: { days: Map<string, Transaction[]>; newest: number }) {
  const base = useSettings()!.baseCurrency;
  const [unit] = useContext(UnitContext);
  const { kind } = useMonth();
  const kindOf = useKindOf();
  return (
    <div className={`mt-6 ${panel}`}>
      {[...days].map(([date, rows]) => {
        const counted = rows.filter((e) => kindOf(e) === (kind ?? "expense"));
        return (
          <section key={date} id={`day-${date}`} className="scroll-mt-4 not-first:border-t not-first:border-line">
            <h2 className="flex items-baseline justify-between gap-3 px-4 pt-3.5 pb-0.5 text-[12px] font-semibold text-ink2 legend">
              {dayLabel(date)}
              {counted.length > 1 && (
                <span className="num font-sans text-[16px] font-semibold tracking-normal normal-case text-ink">
                  {kind === "income" && "+"}
                  {money(inBase(counted, base), base, unit)}
                  {counted.some((e) => e.baseAmount === null) && (
                    <span className="font-sans"> + {counted.filter((e) => e.baseAmount === null).length} without rates · incomplete</span>
                  )}
                </span>
              )}
            </h2>
            <ul>
              {rows.map((e) => (
                <SwipeRow key={e.id} transaction={e} fresh={e.id > newest || e.id < 0} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
