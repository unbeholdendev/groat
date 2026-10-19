import { days } from "../../lib/period";

export function cumulative(buckets: { start: string; total: number }[], [from, to]: [string, string]) {
  let sum = 0;
  const at = (d: string) => Math.max(0, days(from, d) - 1);
  return buckets.flatMap((b, i) => [[at(b.start), sum], [i < buckets.length - 1 ? at(buckets[i + 1].start) - 1 : at(to), (sum += b.total)]]);
}

export function valueAt(pts: number[][], n: number) {
  const i = pts.findIndex(([a]) => a > n);
  if (i < 1) return pts.at(i)?.[1] ?? 0;
  const [[a, b], [c, d]] = [pts[i - 1], pts[i]];
  return Math.round(b + ((d - b) * (n - a)) / (c - a));
}
