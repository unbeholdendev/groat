import { useContext } from "react";
import { panel } from "../../components/styles";
import { useSettings } from "../../lib/api";
import { dayLabel } from "../../lib/dates";
import { money } from "../../lib/money";
import type { Transaction } from "../../lib/schemas";
import { UnitContext } from "../../lib/unit";
import { inBase } from "./queries";
import { SwipeRow } from "./swipe-row";

export function DayList({ days, newest }: { days: Map<string, Transaction[]>; newest: number }) {
  const base = useSettings()!.baseCurrency;
  const [unit] = useContext(UnitContext);
  return (
    <div className={`mt-6 ${panel}`}>
      {[...days].map(([date, rows]) => (
        <section key={date} id={`day-${date}`} className="scroll-mt-4 not-first:border-t not-first:border-line">
          <h2 className="flex justify-between px-4 pt-3.5 pb-0.5 text-[13px] font-semibold text-ink2">
            {dayLabel(date)}
            {rows.length > 1 && (
              <span className="num font-medium text-ink3">
                {money(inBase(rows, base), base, unit)}
                {rows.some((e) => e.baseAmount === null) && <span className="font-sans"> + {rows.filter((e) => e.baseAmount === null).length} unconverted</span>}
              </span>
            )}
          </h2>
          <ul>
            {rows.map((e) => (
              <SwipeRow key={e.id} transaction={e} fresh={e.id > newest || e.id < 0} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
