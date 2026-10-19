import { knownCurrencies } from "../../../shared/amount";

const currencyNames = new Intl.DisplayNames(["en-GB"], { type: "currency" });
const nameOf = (c: string) => (c === "BTC" ? "Bitcoin" : currencyNames.of(c));

export const CurrencyOptions = () =>
  [...knownCurrencies].map((c) => (
    <option key={c} value={c}>
      {c} · {nameOf(c)}
    </option>
  ));
