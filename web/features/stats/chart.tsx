import { type PointerEvent, type ReactNode, useEffect, useId, useState } from "react";
import { days } from "../../lib/period";
import { cumulative, valueAt } from "./cumulative";

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
  const [, py] = prev[prev.length - 1];
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
    </div>
  );
}
