import { useEffect, useRef, useState } from "react";
import type { Unit } from "../../shared/amount";
import type { change } from "../lib/period";
import { money } from "../lib/money";
import { Icon } from "./icon";

export const Pill = ({ d }: { d: NonNullable<ReturnType<typeof change>> }) => (
  <span className={`num inline-flex items-center gap-0.5 ${d.tone}`}>
    {d.tone !== "text-ink3" && (
      <Icon className={`size-3 stroke-[2.4] ${d.tone === "text-down" ? "rotate-180" : ""}`}>
        <path d="M12 19V5m-6 6 6-6 6 6" />
      </Icon>
    )}
    {d.text.replace(/^[+−]/, "")}
  </span>
);

export function numeralSize(length: number) {
  if (length > 14) return "text-[28px]";
  if (length > 12) return "text-[34px]";
  return length > 9 ? "text-[44px]" : "text-[60px]";
}

let counted = false;

function useCountUp(to: number) {
  const [shown, setShown] = useState(counted ? to : 0);
  const from = useRef(shown);
  useEffect(() => {
    counted = true;
    const start = from.current;
    if (start === to || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      from.current = to;
      setShown(to);
      return;
    }
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

export function Total({
  amount,
  currency,
  unit,
  className = "",
}: {
  amount: number;
  currency: string;
  unit?: Unit;
  className?: string;
}) {
  const final = money(amount, currency, unit);
  const [whole, part] = money(useCountUp(amount), currency, unit).split(/(?=\.\d+$)/);
  return (
    <b
      className={`denomination font-bold tracking-[-0.02em] whitespace-nowrap ${numeralSize(final.length)} leading-none ${className}`}
    >
      <span className="sr-only">{final}</span>
      <span aria-hidden>
        {whole}
        {part && <small className="text-[0.5em] font-medium tracking-[-0.02em] opacity-65">{part}</small>}
      </span>
    </b>
  );
}
