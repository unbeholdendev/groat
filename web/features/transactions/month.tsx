import { FormError } from "../../components/form";
import { Button } from "../../components/button";
import { useContext, useState } from "react";
import { panel } from "../../components/styles";
import { useSettings } from "../../lib/api";
import type { Transaction } from "../../lib/schemas";
import { iso } from "../../lib/period";
import { today } from "../../lib/dates";
import { UnitContext } from "../../lib/unit";
import { QuickAddContext } from "../quick-add/quick-add";
import { Breakdown } from "./breakdown";
import { DayList } from "./day-list";
import { Filters } from "./filters";
import { MonthHeader } from "./month-header";
import { PendingList } from "./pending-list";
import { KindFilter } from "./kind-filter";
import { useKindOf, useTransactionQuery, useQueued } from "./queries";
import { useMonth } from "./use-month";

export function Month({ newest }: { newest: number }) {
  const { month, filter, setFilter, filtered, shown, end, label, kind } = useMonth();
  const { onHost } = useContext(QuickAddContext);
  const income = useSettings()?.income;
  const kindOf = useKindOf();
  const [unit] = useContext(UnitContext);
  const [filterPanel, setFilterPanel] = useState<"unopened" | "open" | "closed">("unopened");
  const showFilters = filterPanel === "open";
  const query = useTransactionQuery();
  const listed = query.data;
  const transactions = listed ?? [];
  const queued = useQueued();
  const rows = [...queued.filter((e) => !filtered && e.date.startsWith(shown)), ...transactions]
    .sort((a, b) => b.date.localeCompare(a.date))
    .filter((e) => e.status !== "pending");
  const days = new Map<string, Transaction[]>();
  for (const e of rows) if (!kind || kindOf(e) === kind) days.set(e.date, [...(days.get(e.date) ?? []), e]);

  return (
    <>
      <MonthHeader rows={rows} showFilters={showFilters} onFilters={() => {
        if (filterPanel === "unopened" && !filtered) {
          const past = new Date();
          past.setDate(past.getDate() - 30);
          void setFilter({ ...filter, from: filter.from || iso(past), to: filter.to || today() });
        }
        setFilterPanel(showFilters ? "closed" : "open");
      }} />
      {!filtered && <Breakdown unit={unit} end={month ? end : undefined} />}
      <div ref={onHost} className="my-6" />
      {showFilters && <Filters />}
      {income && <KindFilter />}
      <PendingList />
      {query.isPending && <p role="status" className="mt-6 text-ink2">Loading expenses…</p>}
      <FormError error={query.error} className="mt-4" />
      {query.isError && <Button onClick={() => void query.refetch()}>Try again</Button>}
      {listed && days.size === 0 && (
        <div className={`mt-6 px-6 py-9 text-center ${panel}`}>
          <p className="font-semibold">{filtered ? "Nothing matches" : month ? `Nothing in ${label}` : "Nothing this month yet"}</p>
          <p className="mt-1 text-[13px] text-ink3">
            {filtered ? (
              <Button variant="link" tone="accent" onClick={() => setFilter({})}>
                Clear filters
              </Button>
            ) : month ? (
              "Step back a month, or add one above with a date."
            ) : (
              "Type one above, like “coffee 3.20”."
            )}
          </p>
        </div>
      )}
      {days.size > 0 && <DayList days={days} newest={newest} />}
    </>
  );
}
