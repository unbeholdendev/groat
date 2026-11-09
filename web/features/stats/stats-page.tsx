import { getRouteApi } from "@tanstack/react-router";
import { type ReactNode, useContext, useState } from "react";
import { Pill, Total } from "../../components/total";
import { Segmented } from "../../components/segmented";
import { useApi, useCategories, useSettings } from "../../lib/api";
import { money } from "../../lib/money";
import { change, days, span } from "../../lib/period";
import { period } from "../../lib/schemas";
import { UnitContext } from "../../lib/unit";
import { ByCategory } from "./by-category";
import { ByTag } from "./by-tag";
import { Chart } from "./chart";
import { HeroHead, type Preset, presets } from "./hero-head";
import { IncomeRow } from "./income-row";
import type { Period } from "./types";

const route = getRouteApi("/stats");
const incomeOnly = (p: Period): Period => ({ ...p, total: p.income.total, categories: p.income.categories });

const group = (from: string, to: string) => {
  const n = days(from, to);
  return n <= 62 ? "day" : n <= 366 ? "week" : "month";
};
const useSeries = ([from, to]: [string, string], by = group(from, to)) =>
  useApi(period, [`/api/stats?from=${from}&to=${to}&group=${by}`], { enabled: from <= to, throwOnError: true }).data;

export function StatsPage() {
  const [unit] = useContext(UnitContext);
  const { from, to } = route.useSearch();
  const navigate = route.useNavigate();
  const categories = useCategories();
  const [custom, setCustom] = useState(false);
  const range = from && to ? `${from},${to}` : span("This month").range.join();
  const preset = (!custom && presets.find((p) => p !== "Custom" && span(p).range.join() === range)) || "Custom";
  const [open, setOpen] = useState<number | null>(null);
  const [scrubbed, setScrubbed] = useState<ReactNode>(null);
  const income = useSettings()?.income;
  const [shown, setBreakdown] = useState<"Spending" | "Income">("Spending");
  const breakdown = income ? shown : "Spending";
  const [rangeFrom = "", rangeTo = ""] = range.split(",");
  const s = span(preset, [rangeFrom, rangeTo]);
  const setRange = (from: string, to: string) => navigate({ search: { from, to }, replace: true });
  const setPreset = (p: Preset) => {
    setCustom(p === "Custom");
    setOpen(null);
    if (p !== "Custom") setRange(...span(p).range);
  };
  const now = useSeries(s.range);
  const ref = useSeries(s.ref, "month");
  const full = useSeries(s.full);
  const head = <HeroHead preset={preset} range={s.range} onPreset={setPreset} onRange={setRange} />;

  if (!now || !ref || !full)
    return (
      <section>
        {head}
        <div className="mt-7 h-[262px] text-ink2">{s.range[0] > s.range[1] && "From is after To."}</div>
      </section>
    );

  const show = (n: number) => money(n, now.baseCurrency, unit);
  const running = s.end > s.range[1];
  const n = days(...s.range);
  const vs = preset !== "Custom" ? s.name : n === 1 ? "the day before" : `the ${n} days before`;
  const incomplete = now.unconverted > 0 || ref.unconverted > 0 || full.unconverted > 0;
  const d = !incomplete && change(now.total, ref.total);

  return (
    <>
      <section>
        {head}
        <Total amount={now.total} currency={now.baseCurrency} unit={unit} className="engraving mt-7 block" />
        <p className="mt-2.5 flex min-h-[26px] flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-medium text-ink2">
          {incomplete ? "Incomplete totals · comparison unavailable" : scrubbed ?? (d ? (
            <>
              <Pill d={d} />
              vs {vs}
              {running && " by today"}
            </>
          ) : (
            `Nothing in ${vs}${running ? " by today" : ""}`
          ))}
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
          ghost={!incomplete && full.total > 0}
          show={show}
          name={s.name}
          onScrub={setScrubbed}
          aria={incomplete ? "Incomplete totals. Expenses without rates are excluded; comparison unavailable." : `${show(now.total)} ${running ? "so far" : "in total"}. ${preset === "Custom" ? "The period before" : s.name} was at ${show(ref.total)} by this point and ended at ${show(full.total)}.`}
        />
      </section>
      {now.unconverted > 0 && <p className="mt-3 text-[13px] text-amber">{now.unconverted === 1 ? "1 entry has no rate and is left out." : `${now.unconverted} entries have no rate and are left out.`}</p>}
      {income && <IncomeRow now={now} prev={ref} show={show} />}
      {income && (
        <div className="mt-7">
          <Segmented label="Breakdown" options={["Spending", "Income"]} value={breakdown} onChange={(b) => (setBreakdown(b), setOpen(null))} />
        </div>
      )}
      <ByCategory
        now={breakdown === "Income" ? incomeOnly(now) : now}
        prev={breakdown === "Income" ? incomeOnly(ref) : ref}
        categories={categories}
        range={s.range}
        vs={vs}
        show={show}
        open={open}
        onOpen={setOpen}
        empty={breakdown === "Income" ? "No income in this period." : "No spending in this period."}
      />
      <ByTag now={now} prev={ref} range={s.range} vs={vs} show={show} />
    </>
  );
}
