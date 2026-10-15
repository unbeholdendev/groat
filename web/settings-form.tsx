import { type FormEvent, useState } from "react";
import { Link } from "@tanstack/react-router";
import { type Settings, theme as themes, useSend } from "./api";
import { Chevron, chip, Icon } from "./ui";

const currencyNames = new Intl.DisplayNames(["en-GB"], { type: "currency" });
const allCurrencies = [...Intl.supportedValuesOf("currency"), "BTC"].sort();
const CurrencyOptions = ({ except = [] }: { except?: string[] }) =>
  allCurrencies
    .filter((c) => !except.includes(c))
    .map((c) => (
      <option key={c} value={c}>
        {c} · {c === "BTC" ? "Bitcoin" : currencyNames.of(c)}
      </option>
    ));

export function SettingsForm(props: {
  settings: Settings;
  path: string;
  method: string;
  title: string;
  onSaved?: () => void;
}) {
  const onboarding = !props.settings.onboarded;
  const [baseCurrency, setBase] = useState(props.settings.baseCurrency);
  const [others, setOthers] = useState(props.settings.currencies.filter((c) => c !== props.settings.baseCurrency));
  const [theme, setTheme] = useState(props.settings.theme);
  const mutation = useSend(props.onSaved);
  const message = mutation.isSuccess ? "Saved" : mutation.error?.message;

  function save(e: FormEvent) {
    e.preventDefault();
    mutation.mutate([
      props.method,
      props.path,
      { baseCurrency, currencies: others, theme },
    ]);
  }

  return (
    <form onSubmit={save} onChangeCapture={() => mutation.reset()} className="flex flex-col gap-4">
      <h1 className="text-display font-bold">{props.title}</h1>
      {onboarding && <p className="-mt-2 text-ink2">Pick the currency totals are shown in, and any others you spend in. You can change both later.</p>}
      <label className="label">
        Base currency
        <select className="input" value={baseCurrency} onChange={(e) => (setBase(e.target.value), setOthers(others.filter((c) => c !== e.target.value)))}>
          <CurrencyOptions />
        </select>
      </label>
      <fieldset className="label">
        <legend className="mb-1.5">Other currencies you spend in</legend>
        <div className="flex flex-wrap gap-x-1.5 gap-y-3">
          {others.map((c) => (
            <button type="button" key={c} aria-label={`Remove ${c}`} className={`${chip} hit`} onClick={() => (setOthers(others.filter((o) => o !== c)), mutation.reset())}>
              {c}
              <Icon className="size-2.5 stroke-2 text-ink3">
                <path d="M6 6l12 12M18 6 6 18" />
              </Icon>
            </button>
          ))}
          <label className={`${chip} text-ink2`}>
            <Icon className="size-2.5 stroke-2">
              <path d="M12 5v14M5 12h14" />
            </Icon>
            Add
            <select aria-label="Add a currency" className="absolute inset-x-0 -inset-y-2.5 opacity-0" value="" onChange={(e) => setOthers([...others, e.target.value])}>
              <option value="" disabled>
                Add a currency
              </option>
              <CurrencyOptions except={[baseCurrency, ...others]} />
            </select>
          </label>
        </div>
      </fieldset>
      {!onboarding && (
        <label className="label">
          Theme
          <select className="input" value={theme} onChange={(e) => (setTheme(themes.parse(e.target.value)), mutation.mutate([props.method, props.path, { theme: e.target.value }]))}>
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      )}
      {message && <p className={`text-sm ${mutation.isError ? "text-up" : "text-ink3"}`}>{message}</p>}
      <button className="primary">{onboarding ? "Start" : "Save"}</button>
      {props.settings.ai && !onboarding && (
        <Link to="/chat" className="mt-4 flex items-center justify-between border-y border-line py-3">
          Past chats
          <Chevron className="size-4 -rotate-90 text-ink3" />
        </Link>
      )}
    </form>
  );
}
