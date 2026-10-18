import { useEffect, useRef, useState } from "react";
import type { Unit } from "../../shared/amount";
import type { change } from "../lib/period";
import { money } from "../lib/money";
import { Icon } from "./icon";

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
      const k = Math.min(Math.max((t - t0) / 700, 0), 1);
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
    <b className={`font-semibold tracking-[-0.04em] whitespace-nowrap ${final.length > 12 ? "text-[34px]" : final.length > 9 ? "text-[44px]" : "text-[60px]"} leading-none ${className}`}>
      <span className="sr-only">{final}</span>
      <span aria-hidden>
        {whole}
        {part && <small className="text-[0.5em] font-medium tracking-[-0.02em] opacity-65">{part}</small>}
      </span>
    </b>
  );
}
