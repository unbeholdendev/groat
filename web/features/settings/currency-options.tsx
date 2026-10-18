const currencyNames = new Intl.DisplayNames(["en-GB"], { type: "currency" });
const allCurrencies = [...Intl.supportedValuesOf("currency"), "BTC"].sort();
export const nameOf = (c: string) => (c === "BTC" ? "Bitcoin" : currencyNames.of(c));

export const CurrencyOptions = ({ except = [] }: { except?: string[] }) =>
  allCurrencies
    .filter((c) => !except.includes(c))
    .map((c) => (
      <option key={c} value={c}>
        {c} · {nameOf(c)}
      </option>
    ));
