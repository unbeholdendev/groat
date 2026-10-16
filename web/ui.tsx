import { createContext, type ReactNode } from "react";
import type { Unit } from "../shared/amount";

export const UnitContext = createContext<[Unit, (u: Unit) => void]>(["BTC", () => {}]);

export const Icon = ({ children, className = "size-[21px]" }: { children: ReactNode; className?: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden className={`${className} fill-none stroke-current stroke-[1.6] [stroke-linecap:round] [stroke-linejoin:round]`}>
    {children}
  </svg>
);
export const Chevron = ({ className = "size-2.5 text-ink3" }: { className?: string }) => (
  <Icon className={className}>
    <path d="m6 9 6 6 6-6" />
  </Icon>
);

export const Confirm = (props: { ask: ReactNode; yes: string; onYes: () => void; onNo: () => void }) => (
  <span className="rise inline-flex items-center gap-1 text-[13px] font-medium">
    <span className="text-ink2">{props.ask}</span>
    <button type="button" autoFocus className="hit rounded-chip px-2.5 py-1.5 text-ink2" onClick={props.onNo}>
      Keep
    </button>
    <button type="button" className="hit rounded-chip px-2.5 py-1.5 text-up" onClick={props.onYes}>
      {props.yes}
    </button>
  </span>
);

export const chip = "relative inline-flex shrink-0 items-center whitespace-nowrap gap-1.5 rounded-chip border border-line2 bg-surface px-2 py-[3px] text-[13px] font-medium text-ink has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent";
export const divide = "relative not-last:after:absolute not-last:after:inset-x-0 not-last:after:bottom-0 not-last:after:ml-16 not-last:after:h-px not-last:after:bg-line";

export const panel = "overflow-hidden rounded-panel bg-surface shadow-panel";

export function Segmented<T extends string>(props: { label: string; options: readonly T[]; names?: Record<T, string>; value: T; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={props.label} className="relative flex h-10 rounded-chip bg-track p-1">
      <span
        aria-hidden
        className="absolute inset-y-1 left-1 rounded-chip bg-surface shadow-thumb transition-transform duration-[260ms] ease-out"
        style={{ width: `calc((100% - 8px) / ${props.options.length})`, transform: `translateX(${props.options.indexOf(props.value) * 100}%)` }}
      />
      {props.options.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={props.value === o}
          onClick={() => props.onChange(o)}
          className={`hit press relative flex-1 rounded-chip text-[13px] font-medium whitespace-nowrap transition-colors ${props.value === o ? "text-ink" : "text-ink2"}`}
        >
          {props.names?.[o] ?? o}
        </button>
      ))}
    </div>
  );
}
export const sectionHead = "mt-7 mb-3 px-1 text-[20px] font-[650] tracking-[-0.02em]";
export const linkRow = `press relative flex h-[62px] w-full items-center gap-3 px-4 text-left font-medium hover:bg-surface2 ${divide}`;
