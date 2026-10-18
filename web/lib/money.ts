import { formatAmount, type Unit } from "../../shared/amount";

export function money(amount: number, currency: string, unit?: Unit) {
  const text = formatAmount(amount, currency, unit);
  if (currency === "BTC") return unit === "sats" ? `${Number(text).toLocaleString("en-GB")} sats` : `${text} BTC`;
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(Number(text));
}
