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
