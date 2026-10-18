import { getRouteApi } from "@tanstack/react-router";
import { type ReactNode, useContext, useState } from "react";
import { field } from "../../components/styles";
import { Pill, Total } from "../../components/total";
import { useApi, useCategories } from "../../lib/api";
import { money } from "../../lib/money";
import { change, days, span, usePeriod } from "../../lib/period";
import { period } from "../../lib/schemas";
import { UnitContext } from "../../lib/unit";
import { ByCategory } from "./by-category";
import { ByTag } from "./by-tag";
import { Chart } from "./chart";
import { HeroHead, type Preset, presets } from "./hero-head";

const route = getRouteApi("/stats");

const group = (from: string, to: string) => {
  const n = days(from, to);
  return n <= 62 ? "day" : n <= 366 ? "week" : "month";
};
const useSeries = ([from, to]: [string, string]) =>
  useApi(period, [`/api/stats?from=${from}&to=${to}&group=${group(from, to)}`], { enabled: from <= to }).data;

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
  const [rangeFrom = "", rangeTo = ""] = range.split(",");
  const s = span(preset, [rangeFrom, rangeTo]);
  const setRange = (from: string, to: string) => navigate({ search: { from, to }, replace: true });
  const setPreset = (p: Preset) => {
    setCustom(p === "Custom");
    setOpen(null);
    if (p !== "Custom") setRange(...span(p).range);
  };
  const now = useSeries(s.range);
  const ref = usePeriod(s.ref);
  const full = useSeries(s.full);
  const head = <HeroHead preset={preset} range={s.range} onPreset={setPreset} onRange={setRange} />;

  if (!now || !ref || !full)
    return (
      <section className={field}>
        {head}
        <div className="mt-7 h-[262px]" />
      </section>
    );

  const show = (n: number) => money(n, now.baseCurrency, unit);
  const running = s.end > s.range[1];
  const n = days(...s.range);
  const vs = preset !== "Custom" ? s.name : n === 1 ? "the day before" : `the ${n} days before`;
  const d = change(now.total, ref.total);

  return (
    <>
      <section className={field}>
        {head}
        <Total amount={now.total} currency={now.baseCurrency} unit={unit} className="mt-7 block text-on-hero" />
        <p className="mt-2.5 flex min-h-[26px] flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-medium text-on-hero2">
          {scrubbed ?? (d ? (
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
          ghost={full.total > 0}
          show={show}
          name={s.name}
          onScrub={setScrubbed}
          aria={`${show(now.total)} ${running ? "so far" : "in total"}. ${preset === "Custom" ? "The period before" : s.name} was at ${show(ref.total)} by this point and ended at ${show(full.total)}.`}
        />
      </section>
      {now.unconverted > 0 && <p className="mt-3 text-[13px] text-amber">{now.unconverted === 1 ? "1 expense has no rate and is left out." : `${now.unconverted} expenses have no rate and are left out.`}</p>}
      <ByCategory now={now} prev={ref} categories={categories} range={s.range} vs={vs} show={show} open={open} onOpen={setOpen} />
      <ByTag now={now} prev={ref} range={s.range} vs={vs} show={show} />
    </>
  );
}
