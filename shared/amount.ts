export type Unit = "sats" | "BTC";

// What Frankfurter quotes against USD, less metals and SDR, plus BTC from mempool.space
export const knownCurrencies = new Set(
  `AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BHD BIF BMD BND BOB BRL BSD BTC BTN BWP BYN BZD CAD CDF CHF CLP CMD CNH CNY COP
  CRC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GGP GHS GIP GMD GNF GTQ GYD HKD HNL HTG HUF IDR ILS IMP INR IQD IRR
  ISK JEP JMD JOD JPY KES KGS KHR KMF KPW KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MYR
  MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP SLE SOS SRD SSP STN SVC
  SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD UYU UZS VES VND VUV WST XAF XCD XCG XOF XPF YER ZAR ZMW ZWG`.split(/\s+/),
);

export const byRecent = (recent: string[]) => [...new Set([...recent, ...knownCurrencies])];

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
