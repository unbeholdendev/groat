import { Fragment, useContext, useState } from "react";
import { panel } from "../../components/styles";
import { useSettings } from "../../lib/api";
import { dayLabel } from "../../lib/dates";
import { money } from "../../lib/money";
import type { Expense } from "../../lib/schemas";
import { UnitContext } from "../../lib/unit";
import { inBase } from "./queries";
import { SetRate } from "./set-rate";
import { SwipeRow } from "./swipe-row";

export function DayList({ days, newest }: { days: Map<string, Expense[]>; newest: number }) {
  const base = useSettings()!.baseCurrency;
  const [unit] = useContext(UnitContext);
  const [rating, setRating] = useState<number | null>(null);
  return (
    <div className={`mt-6 ${panel}`}>
      {[...days].map(([date, rows]) => (
        <section key={date} className="not-first:border-t not-first:border-line">
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
              <Fragment key={e.id}>
                <SwipeRow expense={e} fresh={e.id > newest || e.id < 0} onSetRate={() => setRating(e.id)} />
                {rating === e.id && (
                  <li>
                    <SetRate expense={e} onDone={() => setRating(null)} />
                  </li>
                )}
              </Fragment>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
