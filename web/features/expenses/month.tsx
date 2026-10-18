import { Button } from "../../components/button";
import { useContext, useState } from "react";
import { panel } from "../../components/styles";
import type { Expense } from "../../lib/schemas";
import { UnitContext } from "../../lib/unit";
import { Breakdown } from "./breakdown";
import { DayList } from "./day-list";
import { Filters } from "./filters";
import { MonthHeader } from "./month-header";
import { PendingList } from "./pending-list";
import { useExpenses, useQueued } from "./queries";
import { useMonth } from "./use-month";

export function Month({ newest }: { newest: number }) {
  const { month, setFilter, filtered, shown, end, label } = useMonth();
  const [unit] = useContext(UnitContext);
  const [showFilters, setShowFilters] = useState(false);
  const listed = useExpenses();
  const expenses = listed ?? [];
  const queued = useQueued();
  const days = new Map<string, Expense[]>();
  for (const e of [...queued.filter((e) => !filtered && e.date.startsWith(shown)), ...expenses].sort((a, b) => b.date.localeCompare(a.date)))
    if (e.status !== "pending") days.set(e.date, [...(days.get(e.date) ?? []), e]);

  return (
    <>
      <MonthHeader rows={[...days.values()].flat()} showFilters={showFilters} onFilters={() => setShowFilters(!showFilters)} />
      {!filtered && <Breakdown unit={unit} end={month ? end : undefined} />}
      {showFilters && <Filters />}
      <PendingList />
      {listed && expenses.length + queued.length === 0 && (
        <div className={`mt-6 px-6 py-9 text-center ${panel}`}>
          <p className="font-semibold">{filtered ? "Nothing matches" : month ? `Nothing in ${label}` : "Nothing this month yet"}</p>
          <p className="mt-1 text-[13px] text-ink3">
            {filtered ? (
              <Button variant="link" tone="accent" onClick={() => setFilter({})}>
                Clear filters
              </Button>
            ) : month ? (
              "Step back a month, or add one below with a date."
            ) : (
              "Type one below, like “coffee 3.20”."
            )}
          </p>
        </div>
      )}
      {days.size > 0 && <DayList days={days} newest={newest} />}
    </>
  );
}
