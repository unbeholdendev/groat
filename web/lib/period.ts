import { period } from "./schemas";
import { useApi } from "./api";

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
