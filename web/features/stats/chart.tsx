import { type PointerEvent, type ReactNode, useEffect, useId, useState } from "react";
import { days } from "../../lib/period";
import { cumulative, valueAt } from "./cumulative";

const dayAt = (from: string, n: number) => {
  const [y, m, d] = from.split("-").map(Number);
  return new Date(y, m - 1, d + n).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};
const H = 112;
const short = (d: string) => new Date(`${d}T00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export function Chart(props: {
  now: { start: string; total: number }[];
  prev: { start: string; total: number }[];
  range: [string, string];
  full: [string, string];
  end: string;
  max: number;
  label: string;
  ghost: boolean;
  aria: string;
  show: (n: number) => string;
  name: string;
  onScrub: (readout: ReactNode) => void;
}) {
  const id = `g${useId().replace(/\W/g, "")}`;
  const [w, setW] = useState(0);
  const measure = (el: HTMLDivElement) => {
    const o = new ResizeObserver(() => setW(el.clientWidth));
    o.observe(el);
    return () => o.disconnect();
  };
  const extent = Math.max(days(props.range[0], props.end), days(...props.full)) - 1 || 1;
  const x = (n: number) => (n / extent) * w;
  const y = (v: number) => H - (v / (props.max || 1)) * (H - 20);
  const path = (pts: number[][]) => pts.map(([a, b], i) => `${i ? "L" : "M"}${x(a)},${y(b)}`).join("");
  const now = cumulative(props.now, props.range);
  const prev = cumulative(props.prev, props.full);
  const [ex, ey] = now[now.length - 1];
  const [previousEnd, py] = prev[prev.length - 1];
  const tableEnd = props.ghost ? Math.max(ex, previousEnd) : ex;
  const running = props.end > props.range[1];
  const clash = x(ex) > w - 110 && Math.abs(y(ey) - y(py)) < 22;
  const above = !(clash && ey > py);
  const [at, setAt] = useState<number | null>(null);
  const [fy, fm, fd] = props.range[0].split("-").map(Number);
  const scrub = (e: PointerEvent<HTMLDivElement>) => {
    const n = Math.min(ex, Math.max(0, Math.round(((e.clientX - e.currentTarget.getBoundingClientRect().left) / w) * extent)));
    setAt(n);
    props.onScrub(
      <>
        <span className="num text-ink">
          {new Date(fy, fm - 1, fd + n).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · {props.show(valueAt(now, n))}
        </span>
        {props.ghost && <span className="num">vs {props.name} {props.show(valueAt(prev, n))}</span>}
      </>,
    );
  };
  const unscrub = () => (setAt(null), props.onScrub(null));
  useEffect(() => unscrub, []);

  return (
    <div className="mt-5">
      <div
        ref={measure}
        onPointerDown={scrub}
        onPointerMove={scrub}
        onPointerLeave={unscrub}
        onPointerUp={(e) => e.pointerType !== "mouse" && unscrub()}
        onPointerCancel={unscrub}
        className="relative h-[112px] touch-pan-y select-none"
      >
        {w > 0 && (
          <svg role="img" aria-label={props.aria} viewBox={`0 0 ${w} ${H}`} className="size-full overflow-visible text-accent">
            <defs>
              <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="currentColor" stopOpacity="0.18" />
                <stop offset="1" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
            </defs>
            <line x1="0" x2={w} y1={H} y2={H} className="stroke-line2" />
            {props.ghost && <path d={path(prev)} fill="none" className="stroke-ink3" strokeWidth="1.5" strokeDasharray="4 4" strokeLinejoin="round" />}
            {running && <line x1={x(ex)} x2={x(ex)} y1="0" y2={H} className="stroke-line2" />}
            <path d={`${path(now)}L${x(ex)},${H}L0,${H}Z`} fill={`url(#${id})`} className="animate-fade [animation-delay:200ms]" />
            <path d={path(now)} pathLength={1} fill="none" className="draw stroke-accent" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            {running && <circle cx={x(ex)} cy={y(ey)} r="5.5" strokeWidth="3" className="animate-fade fill-accent stroke-bg [animation-delay:700ms]" />}
            {at !== null && (
              <>
                <line x1={x(at)} x2={x(at)} y1="0" y2={H} className="stroke-ink3" />
                {props.ghost && <circle cx={x(at)} cy={y(valueAt(prev, at))} r="3.5" className="fill-ink3" />}
                <circle cx={x(at)} cy={y(valueAt(now, at))} r="5.5" strokeWidth="3" className="fill-accent stroke-bg" />
              </>
            )}
          </svg>
        )}
        {props.ghost && at === null && (
          <span
            aria-hidden
            className={`num absolute right-0 text-[11px] whitespace-nowrap text-ink3 ${above ? "-translate-y-[calc(100%+6px)]" : "translate-y-1.5"}`}
            style={{ top: y(py) }}
          >
            {props.label}
          </span>
        )}
      </div>
      <div aria-hidden className="num mt-2 flex justify-between text-[11px] text-ink3">
        <span>{short(props.range[0])}</span>
        <span>{short(props.end)}</span>
      </div>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink2">
        <span><span aria-hidden className="mr-1 inline-block w-4 border-t-2 border-accent" />Cumulative spending</span>
        {props.ghost && <span><span aria-hidden className="mr-1 inline-block w-4 border-t-2 border-dashed border-ink3" />{props.name}</span>}
      </p>
      <details className="mt-3 text-[13px] text-ink2">
        <summary className="min-h-11 cursor-pointer py-3">Compare daily totals</summary>
        <div role="region" aria-label="Daily comparison values" tabIndex={0} className="max-h-72 overflow-auto">
          <table className="num w-full text-left" aria-label="Cumulative spending by day">
            <thead><tr><th scope="col">Date</th><th scope="col">Cumulative spending</th>{props.ghost && <><th scope="col">Comparison date</th><th scope="col">{props.name}</th></>}</tr></thead>
            <tbody>{Array.from({ length: tableEnd + 1 }, (_, n) => <tr key={n} className="border-t border-line"><th scope="row" className="py-2 font-normal">{n <= ex ? dayAt(props.range[0], n) : "Outside current range"}</th><td>{n <= ex ? props.show(valueAt(now, n)) : "—"}</td>{props.ghost && <><td>{n <= previousEnd ? dayAt(props.full[0], n) : "Outside comparison range"}</td><td>{n <= previousEnd ? props.show(valueAt(prev, n)) : "—"}</td></>}</tr>)}</tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
