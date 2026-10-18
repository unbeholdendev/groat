import type { ComponentProps, ReactNode } from "react";
import { today } from "../lib/dates";
import { Chevron } from "./icon";

export const overlay = "absolute inset-0 opacity-0";

export const Picker = ({ className, chevron = <Chevron />, children }: { className: string; chevron?: ReactNode; children: ReactNode }) => (
  <label className={className}>
    {children}
    {chevron}
  </label>
);

export const DateInput = ({ value, onChange, className = overlay }: { value: string; onChange: (date: string) => void; className?: string }) => (
  <input
    aria-label="Date"
    type="date"
    className={className}
    max={today()}
    value={value}
    onClick={(e) => e.currentTarget.showPicker?.()}
    onChange={(e) => onChange(e.target.value || today())}
  />
);

export const CurrencySelect = ({ currencies, ...props }: ComponentProps<"select"> & { currencies: string[] }) => (
  <select aria-label="Currency" {...props}>
    {currencies.map((c) => (
      <option key={c}>{c}</option>
    ))}
  </select>
);
