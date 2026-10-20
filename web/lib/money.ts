import { decimals, formatAmount, type Unit } from "../../shared/amount";

export function money(amount: number, currency: string, unit?: Unit) {
  const text = formatAmount(amount, currency, unit);
  if (currency === "BTC") return unit === "sats" ? `${Number(text).toLocaleString("en-GB")} sats` : `${text} BTC`;
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(Number(text));
}

export function rate(amount: number, currency: string, baseAmount: number, base: string, unit: Unit) {
  const r = baseAmount / 10 ** decimals(base) / (amount / 10 ** decimals(currency));
  const n = (v: number, o?: Intl.NumberFormatOptions) => v.toLocaleString("en-GB", { maximumSignificantDigits: 4, ...o });
  const value = base !== "BTC" ? n(r, { style: "currency", currency: base }) : unit === "sats" ? `${n(r * 1e8)} sats` : `${n(r)} BTC`;
  return `1 ${currency} = ${value}`;
}
