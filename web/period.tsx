import { formatAmount, type Unit } from "../shared/amount";
import { useEffect, useRef, useState } from "react";
import { period, useApi } from "./api";
import { Icon } from "./ui";

export function money(amount: number, currency: string, unit?: Unit) {
  const text = formatAmount(amount, currency, unit);
  if (currency === "BTC") return unit === "sats" ? `${Number(text).toLocaleString("en-GB")} sats` : `${text} BTC`;
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(Number(text));
}

export const iso = (d: Date) => d.toLocaleDateString("en-CA");
export const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1;
const shift = (date: string, n: number) => new Date(Date.parse(date) + n * 864e5).toISOString().slice(0, 10);

export type Span = { range: [string, string]; ref: [string, string]; full: [string, string]; end: string; name: string };

export function span(preset: string, custom?: [string, string], now = new Date()): Span {
  const [y, m, d] = [now.getFullYear(), now.getMonth(), now.getDate()];
  const month = (offset: number, day?: number) => {
    const last = new Date(y, m + offset + 1, 0).getDate();
    return iso(new Date(y, m + offset, Math.min(day ?? last, last)));
  };
  const short = (offset: number) => new Date(y, m + offset, 1).toLocaleDateString("en-GB", { month: "short" });
  if (preset === "This month")
    return { range: [month(0, 1), iso(now)], ref: [month(-1, 1), month(-1, d)], full: [month(-1, 1), month(-1)], end: month(0), name: short(-1) };
  if (preset === "Last month")
    return { range: [month(-1, 1), month(-1)], ref: [month(-2, 1), month(-2)], full: [month(-2, 1), month(-2)], end: month(-1), name: short(-2) };
  if (preset === "Year to date")
    return {
      range: [iso(new Date(y, 0, 1)), iso(now)],
      ref: [iso(new Date(y - 1, 0, 1)), iso(new Date(y - 1, m, d))],
      full: [iso(new Date(y - 1, 0, 1)), iso(new Date(y - 1, 11, 31))],
      end: iso(new Date(y, 11, 31)),
      name: String(y - 1),
    };
  const [from, to] = custom ?? [iso(now), iso(now)];
  const ref: [string, string] = [shift(from, -days(from, to)), shift(from, -1)];
  return { range: [from, to], ref, full: ref, end: to, name: "Before" };
}

export const usePeriod = ([from, to]: [string, string]) =>
  useApi(period, [`/api/stats?from=${from}&to=${to}&group=month`], { enabled: from <= to }).data;

export function change(now: number, before: number) {
  if (!before) return null;
  const pct = Math.round(((now - before) / before) * 100);
  return { text: `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct)}%`, tone: pct > 0 ? "text-up" : pct < 0 ? "text-down" : "text-ink3" };
}

export const Pill = ({ d }: { d: NonNullable<ReturnType<typeof change>> }) => (
  <span
    className={`num inline-flex items-center gap-1 rounded-chip px-[9px] py-[3px] text-xs ${
      d.tone === "text-up" ? "bg-up-soft text-up-ink" : d.tone === "text-down" ? "bg-down-soft text-down-ink" : "bg-on-hero/16 text-on-hero"
    }`}
  >
    {d.tone !== "text-ink3" && (
      <Icon className={`size-3 stroke-[2.4] ${d.tone === "text-down" ? "rotate-180" : ""}`}>
        <path d="M12 19V5m-6 6 6-6 6 6" />
      </Icon>
    )}
    {d.text.replace(/^[+−]/, "")}
  </span>
);

let counted = false;

function useCountUp(to: number) {
  const [shown, setShown] = useState(counted ? to : 0);
  const from = useRef(shown);
  useEffect(() => {
    counted = true;
    const start = from.current;
    if (start === to || matchMedia("(prefers-reduced-motion: reduce)").matches) return void setShown((from.current = to));
    const t0 = performance.now();
    let frame = 0;
    const tick = (t: number) => {
      const k = Math.min((t - t0) / 700, 1);
      from.current = k < 1 ? start + (to - start) * (1 - 2 ** (-10 * k)) : to;
      setShown(Math.round(from.current));
      if (k < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [to]);
  return shown;
}

export function Total({ amount, currency, unit, className = "" }: { amount: number; currency: string; unit?: Unit; className?: string }) {
  const final = money(amount, currency, unit);
  const [whole, part] = money(useCountUp(amount), currency, unit).split(/(?=\.\d+$)/);
  return (
    <b className={`font-semibold tracking-[-0.04em] whitespace-nowrap ${final.length > 9 ? "text-[44px]" : "text-[60px]"} leading-none ${className}`}>
      <span className="sr-only">{final}</span>
      <span aria-hidden>
        {whole}
        {part && <small className="text-[0.5em] font-medium tracking-[-0.02em] opacity-65">{part}</small>}
      </span>
    </b>
  );
}
