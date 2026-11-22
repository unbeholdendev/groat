import { getRouteApi } from "@tanstack/react-router";
import { type ReactNode, useContext, useState } from "react";
import { Pill, Total } from "../../components/total";
import { Segmented } from "../../components/segmented";
import { z } from "zod";
import { useApi, useCategories, useSettings } from "../../lib/api";
import { rangeLabel } from "../../../shared/dates";
import { money } from "../../lib/money";
import { change, days, span } from "../../lib/period";
import { period, sats as satsSchema, tag as tagSchema } from "../../lib/schemas";
import type { Unit } from "../../../shared/amount";
import { UnitContext } from "../../lib/unit";
import { ByCategory } from "./by-category";
import { ByCurrency } from "./by-currency";
import { ByTag } from "./by-tag";
import { Chart } from "./chart";
import { HeroHead, type Preset, presets, tagPresets } from "./hero-head";
import { IncomeRow } from "./income-row";
import type { Period } from "./types";

const route = getRouteApi("/stats");
const incomeOnly = (p: Period): Period => ({ ...p, total: p.income.total, categories: p.income.categories });

type InSats = ReturnType<typeof thenAndToday>;
const thenAndToday = (unit: Unit, show: (n: number) => string) => (then: number, today: number | undefined) =>
  [`${money(then, "BTC", unit)} then`, today !== undefined && `${show(today)} today`].filter((t) => t !== false);

type Sats = z.infer<typeof satsSchema> | undefined;
const SatsLine = ({ sats, inSats }: { sats: Sats; inSats: InSats }) =>
  sats && (
    <p className="num mt-1.5 text-[13px] font-medium text-ink2">
      {[...inSats(sats.total, sats.today?.total), ...(sats.unconverted ? ["incomplete"] : [])].join(" · ")}
    </p>
  );

const group = (from: string, to: string) => {
  const n = days(from, to);
  if (n <= 62) return "day";
  return n <= 366 ? "week" : "month";
};
const scope = ([from, to]: [string, string], tag = "") => ({
  query: `from=${from}&to=${to}${tag && `&tag=${encodeURIComponent(tag)}`}`,
  enabled: !!from && !!to && from <= to,
});
const useSeries = (range: [string, string], by = group(...range), tag = "") => {
  const { query, enabled } = scope(range, tag);
  return useApi(period, [`/api/stats?${query}&group=${by}`], { enabled, throwOnError: true }).data;
};
const useSats = (range: [string, string], tag = "") => {
  const { query, enabled } = scope(range, tag);
  return useApi(satsSchema, [`/api/stats/sats?${query}`], { enabled }).data;
};

export function StatsPage() {
  const { tag } = route.useSearch();
  return tag ? <TagStats key={tag} tag={tag} /> : <PeriodStats />;
}

function PeriodStats() {
  const [unit] = useContext(UnitContext);
  const { from, to } = route.useSearch();
  const navigate = route.useNavigate();
  const [custom, setCustom] = useState(false);
  const range = from && to ? `${from},${to}` : span("This month").range.join();
  const preset = (!custom && presets.find((p) => p !== "Custom" && span(p).range.join() === range)) || "Custom";
  const [scrubbed, setScrubbed] = useState<ReactNode>(null);
  const [rangeFrom = "", rangeTo = ""] = range.split(",");
  const s = span(preset, [rangeFrom, rangeTo]);
  const setRange = (from: string, to: string) => navigate({ search: { from, to }, replace: true });
  const setPreset = (p: Preset) => {
    setCustom(p === "Custom");
    if (p !== "Custom") setRange(...span(p).range);
  };
  const now = useSeries(s.range);
  const ref = useSeries(s.ref, "month");
  const full = useSeries(s.full);
  const sats = useSats(s.range);
  const head = <HeroHead presets={presets} preset={preset} range={s.range} onPreset={setPreset} onRange={setRange} />;

  if (!now || !ref || !full)
    return (
      <section>
        {head}
        <div className="mt-7 h-[262px] text-ink2">{s.range[0] > s.range[1] && "From is after To."}</div>
      </section>
    );

  const show = (n: number) => money(n, now.baseCurrency, unit);
  const inSats = thenAndToday(unit, show);
  const running = s.end > s.range[1];
  const n = days(...s.range);
  const vs = (running && rangeLabel(...s.ref)) || (preset === "Custom" ? daysBefore(n) : s.name);
  const incomplete = now.unconverted > 0 || ref.unconverted > 0 || full.unconverted > 0;
  const d = !incomplete && change(now.total, ref.total, show);

  return (
    <>
      <section>
        {head}
        <Total amount={now.total} currency={now.baseCurrency} unit={unit} className="mt-7 block" />
        <SatsLine sats={sats} inSats={inSats} />
        <p className="mt-2.5 flex min-h-[26px] flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-medium text-ink2">
          {incomplete
            ? "Incomplete totals · comparison unavailable"
            : (scrubbed ??
              (d ? (
                <>
                  <Pill d={d} />
                  vs {vs}
                </>
              ) : (
                `Nothing in ${vs}`
              )))}
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
          aria={
            incomplete
              ? "Incomplete totals. Expenses without rates are excluded; comparison unavailable."
              : `${show(now.total)} ${running ? "so far" : "in total"}. ${preset === "Custom" ? "The period before" : s.name} was at ${show(ref.total)} by this point and ended at ${show(full.total)}.`
          }
        />
      </section>
      <Breakdowns now={now} prev={ref} sats={sats} range={s.range} vs={vs} show={show} inSats={inSats} />
      <ByTag now={now} prev={ref} vs={vs} show={show} />
    </>
  );
}

function TagStats({ tag }: { tag: string }) {
  const [unit] = useContext(UnitContext);
  const { from, to } = route.useSearch();
  const navigate = route.useNavigate();
  const tags = useApi(z.array(tagSchema), ["/api/tags"]).data;
  const known = tags?.find((t) => t.name === tag);
  const whole: [string, string] = [known?.first ?? "", known?.last ?? ""];
  const [custom, setCustom] = useState(false);
  const range: [string, string] = [from ?? whole[0], to ?? whole[1]];
  const preset = custom || range.join() !== whole.join() ? "Custom" : "Whole tag";
  const [scrubbed, setScrubbed] = useState<ReactNode>(null);
  const now = useSeries(range, undefined, tag);
  const sats = useSats(range, tag);
  const head = (
    <HeroHead
      presets={tagPresets}
      preset={preset}
      range={range}
      tag={tag}
      onPreset={(p) => {
        setCustom(p === "Custom");
        if (p !== "Custom") navigate({ search: { tag }, replace: true });
      }}
      onRange={(from, to) => navigate({ search: { tag, from, to }, replace: true })}
    />
  );

  if (!now)
    return (
      <section>
        {head}
        <div className="mt-7 h-[262px] text-ink2">
          {range[1] && range[0] > range[1] ? "From is after To." : tags && !known?.first && `Nothing tagged #${tag}.`}
        </div>
      </section>
    );

  const show = (n: number) => money(n, now.baseCurrency, unit);
  const inSats = thenAndToday(unit, show);
  const n = days(...range);
  const length = `${rangeLabel(...range)} · ${n === 1 ? "1 day" : `${n} days`}`;

  return (
    <>
      <section>
        {head}
        <Total amount={now.total} currency={now.baseCurrency} unit={unit} className="mt-7 block" />
        <SatsLine sats={sats} inSats={inSats} />
        <p className="mt-2.5 flex min-h-[26px] flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-medium text-ink2">
          {scrubbed ?? (now.unconverted > 0 ? `${length} · incomplete` : length)}
        </p>
        <Chart
          key={range.join()}
          now={now.buckets}
          prev={now.buckets}
          range={range}
          end={range[1]}
          full={range}
          max={now.total}
          label=""
          ghost={false}
          show={show}
          name={`#${tag}`}
          onScrub={setScrubbed}
          aria={`${show(now.total)} in total${now.unconverted > 0 ? ", excluding expenses without rates" : ""}.`}
        />
      </section>
      <Breakdowns now={now} sats={sats} range={range} tag={tag} show={show} inSats={inSats} />
      <ByCurrency now={now} show={show} />
    </>
  );
}

function Breakdowns(props: {
  now: Period;
  prev?: Period;
  sats: Sats;
  range: [string, string];
  tag?: string;
  vs?: string;
  show: (n: number) => string;
  inSats: InSats;
}) {
  const { now, prev, sats } = props;
  const categories = useCategories();
  const income = useSettings()?.income;
  const [shown, setBreakdown] = useState<"Spending" | "Income">("Spending");
  const [open, setOpen] = useState<number | null>(null);
  const breakdown = income ? shown : "Spending";
  const pick = (p: Period) => (breakdown === "Income" ? incomeOnly(p) : p);
  return (
    <>
      {now.unconverted > 0 && (
        <p className="mt-3 text-[13px] text-amber">
          {now.unconverted === 1
            ? "1 entry has no rate and is left out."
            : `${now.unconverted} entries have no rate and are left out.`}
        </p>
      )}
      {income && (
        <IncomeRow
          now={now}
          prev={prev}
          show={props.show}
          sats={
            sats && {
              income: props.inSats(sats.income, sats.today?.income),
              net: props.inSats(
                sats.income - sats.total,
                sats.today ? sats.today.income - sats.today.total : undefined,
              ),
            }
          }
        />
      )}
      {income && (
        <div className="mt-7">
          <Segmented
            label="Breakdown"
            options={["Spending", "Income"]}
            value={breakdown}
            onChange={(b) => {
              setBreakdown(b);
              setOpen(null);
            }}
          />
        </div>
      )}
      <ByCategory
        now={pick(now)}
        prev={prev && pick(prev)}
        categories={categories}
        range={props.range}
        tag={props.tag}
        vs={props.vs ?? ""}
        show={props.show}
        open={open}
        onOpen={setOpen}
        empty={breakdown === "Income" ? "No income in this period." : "No spending in this period."}
      />
    </>
  );
}

function daysBefore(n: number) {
  return n === 1 ? "the day before" : `the ${n} days before`;
}
