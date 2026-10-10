export type Unit = "sats" | "BTC";

export function decimals(currency: string, unit?: Unit) {
  if (currency === "BTC") return unit === "sats" ? 0 : 8;
  return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
}

export function parseAmount(text: string, currency: string, unit?: Unit): number | null {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(text.trim());
  const d = decimals(currency, unit);
  if (!match || (match[2] ?? "").length > d) return null;
  const amount = Number(match[1] + (match[2] ?? "").padEnd(d, "0"));
  return amount > 0 && Number.isSafeInteger(amount) ? amount : null;
}

export function formatAmount(amount: number, currency: string, unit?: Unit) {
  const d = decimals(currency, unit);
  const digits = String(amount).padStart(d + 1, "0");
  return d ? `${digits.slice(0, -d)}.${digits.slice(-d)}` : digits;
}
