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

type Fraction = [bigint, bigint];

function evaluate(text: string, d: number): Fraction | null {
  const tokens = text.replace(/×/g, "*").replace(/÷/g, "/").match(/\d+(?:\.\d+)?|\S/g) ?? [];
  const scale = 10n ** BigInt(d);
  let i = 0;
  const factor = (): Fraction | null => {
    const t = tokens[i++] ?? "";
    if (t === "(") {
      const v = sum();
      return tokens[i++] === ")" ? v : null;
    }
    const [whole, fraction = ""] = t.split(".");
    return /^\d/.test(t) && fraction.length <= d ? [BigInt(whole + fraction.padEnd(d, "0")), 1n] : null;
  };
  const product = () => {
    let v = factor();
    while (v && (tokens[i] === "*" || tokens[i] === "/")) {
      const times = tokens[i++] === "*";
      const w = factor();
      if (!w || (!times && !w[0])) return null;
      v = times ? [v[0] * w[0], v[1] * w[1] * scale] : [v[0] * w[1] * scale, v[1] * w[0]];
    }
    return v;
  };
  const sum = () => {
    let v = product();
    while (v && (tokens[i] === "+" || tokens[i] === "-")) {
      const sign = tokens[i++] === "+" ? 1n : -1n;
      const w = product();
      if (!w) return null;
      v = [v[0] * w[1] + sign * w[0] * v[1], v[1] * w[1]];
    }
    return v;
  };
  const v = sum();
  return v && i === tokens.length ? v : null;
}

export function parseAmount(text: string, currency: string, unit?: Unit): number | null {
  const v = evaluate(text, decimals(currency, unit));
  if (!v) return null;
  const [n, q] = v[1] < 0n ? [-v[0], -v[1]] : v;
  const amount = Number((2n * n + q) / (2n * q));
  return n > 0n && amount > 0 && Number.isSafeInteger(amount) ? amount : null;
}

export function formatAmount(amount: number, currency: string, unit?: Unit) {
  const d = decimals(currency, unit);
  const digits = String(amount).padStart(d + 1, "0");
  return d ? `${digits.slice(0, -d)}.${digits.slice(-d)}` : digits;
}
