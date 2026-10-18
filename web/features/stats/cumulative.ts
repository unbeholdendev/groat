import { days } from "../../lib/period";

export function cumulative(buckets: { start: string; total: number }[], [from, to]: [string, string]) {
  let sum = 0;
  const at = (d: string) => Math.max(0, days(from, d) - 1);
  return buckets.flatMap((b, i) => {
    const start = at(b.start);
    const end = i < buckets.length - 1 ? at(buckets[i + 1].start) : days(from, to);
    return [[start, sum], [end - start > 1 ? end : start, (sum += b.total)], [end, sum]];
  });
}

export const valueAt = (pts: number[][], n: number) => pts.reduce((v, [a, b]) => (a <= n ? b : v), 0);
