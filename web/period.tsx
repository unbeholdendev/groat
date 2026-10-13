import { formatAmount, type Unit } from "../shared/amount";
import { useQuery } from "@tanstack/react-query";

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
  const [from, to] = custom!;
  const ref: [string, string] = [shift(from, -days(from, to)), shift(from, -1)];
  return { range: [from, to], ref, full: ref, end: to, name: "Before" };
}

type Slice = { id: number; name: string; icon: string; color: string; total: number };
export type Category = Slice & { children: Slice[] };
export type Period = { baseCurrency: string; total: number; unconverted: number; categories: Category[]; tags: { name: string; total: number }[] };

export const usePeriod = ([from, to]: [string, string]) =>
  useQuery<Period>({ queryKey: [`/api/stats?from=${from}&to=${to}&group=month`], enabled: from <= to }).data;

export function change(now: number, before: number) {
  if (!before) return null;
  const pct = Math.round(((now - before) / before) * 100);
  return { text: `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct)}%`, tone: pct > 0 ? "text-up" : pct < 0 ? "text-down" : "text-ink3" };
}

export function Total({ text }: { text: string }) {
  const [whole, part] = text.split(/(?=\.\d+$)/);
  return (
    <b className="text-[28px] font-semibold tracking-tight text-ink">
      {whole}
      {part && <small className="text-[17px] font-medium text-ink3">{part}</small>}
    </b>
  );
}
