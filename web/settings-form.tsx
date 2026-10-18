import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { type Settings, theme as themes, useSend } from "./api";
import { chip, Chevron, Icon, Masthead, panel, Segmented, sectionHead } from "./ui";

const currencyNames = new Intl.DisplayNames(["en-GB"], { type: "currency" });
const allCurrencies = [...Intl.supportedValuesOf("currency"), "BTC"].sort();
const nameOf = (c: string) => (c === "BTC" ? "Bitcoin" : currencyNames.of(c));
const CurrencyOptions = ({ except = [] }: { except?: string[] }) =>
  allCurrencies
    .filter((c) => !except.includes(c))
    .map((c) => (
      <option key={c} value={c}>
        {c} · {nameOf(c)}
      </option>
    ));

export const SettingsIcon = ({ children }: { children: ReactNode }) => (
  <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-tile bg-track text-ink2">
    <Icon className="size-[18px] stroke-2">{children}</Icon>
  </span>
);

export function SettingsForm(props: { settings: Settings; path: string; method: string; title: string; onSaved?: () => void }) {
  const onboarding = !props.settings.onboarded;
  const [baseCurrency, setBase] = useState(props.settings.baseCurrency);
  const [others, setOthers] = useState(props.settings.currencies.filter((c) => c !== props.settings.baseCurrency));
  const mutation = useSend(props.onSaved);
  const queryClient = useQueryClient();
  const saved = props.settings.currencies.join();
  useEffect(() => {
    setBase(props.settings.baseCurrency);
    setOthers(props.settings.currencies.filter((c) => c !== props.settings.baseCurrency));
  }, [props.settings.baseCurrency, saved]);

  function change(base: string, list: string[]) {
    setBase(base);
    setOthers(list);
    if (!onboarding) mutation.mutate([props.method, props.path, { baseCurrency: base, currencies: list }]);
  }

  function save(e: FormEvent) {
    e.preventDefault();
    mutation.mutate([props.method, props.path, { baseCurrency, currencies: others }]);
  }

  return (
    <form onSubmit={save} className="flex flex-col">
      {onboarding ? (
        <Masthead title={props.title}>Pick the currency totals are shown in, and any others you spend in. You can change both later.</Masthead>
      ) : (
        <h1 className="text-display font-bold">{props.title}</h1>
      )}
      <h2 className={sectionHead}>Currencies</h2>
      <div className={panel}>
        <label className="relative flex h-[62px] items-center gap-3 px-4 after:absolute after:inset-x-0 after:bottom-0 after:ml-16 after:h-px after:bg-line has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-accent">
          <SettingsIcon>
            <circle cx="12" cy="12" r="8" />
            <path d="M14.5 9.5a2.5 2 0 0 0-5 .5c0 2.5 5 1.5 5 4a2.5 2 0 0 1-5 .5M12 6v1.5M12 16.5V18" />
          </SettingsIcon>
          <span className="flex-1 font-medium">Base currency</span>
          <span className="num text-ink2">{baseCurrency}</span>
          <Chevron className="size-4 text-ink3" />
          <select
            aria-label="Base currency"
            className="absolute inset-0 opacity-0"
            value={baseCurrency}
            onChange={(e) => change(e.target.value, [...(onboarding ? [] : [baseCurrency]), ...others].filter((c) => c !== e.target.value))}
          >
            <CurrencyOptions />
          </select>
        </label>
        <div role="group" aria-labelledby="others" className="px-4 pt-3 pb-4">
          <p id="others" className="mb-3 text-[13px] font-medium text-ink2">
            Others you spend in
          </p>
          <div className="flex flex-wrap gap-x-1.5 gap-y-3">
            {others.map((c) => (
              <button type="button" key={c} aria-label={`Remove ${c}`} title={nameOf(c)} className={`${chip} hit num`} onClick={() => change(baseCurrency, others.filter((o) => o !== c))}>
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
              <select aria-label="Add a currency" className="absolute inset-x-0 -inset-y-2.5 opacity-0" value="" onChange={(e) => change(baseCurrency, [...others, e.target.value])}>
                <option value="" disabled>
                  Add a currency
                </option>
                <CurrencyOptions except={[baseCurrency, ...others]} />
              </select>
            </label>
          </div>
        </div>
      </div>
      {!onboarding && (
        <>
          <h2 className={sectionHead}>Theme</h2>
          <Segmented
            label="Theme"
            options={themes.options}
            names={{ system: "System", light: "Light", dark: "Dark" }}
            value={props.settings.theme}
            onChange={(theme) => (queryClient.setQueryData(["/api/settings"], { ...props.settings, theme }), mutation.mutate([props.method, props.path, { theme }]))}
          />
        </>
      )}
      {mutation.error && <p className="mt-3 px-1 text-sm text-up">{mutation.error.message}</p>}
      {onboarding && (
        <button className="primary mt-7" disabled={mutation.isPending}>
          Start
        </button>
      )}
    </form>
  );
}
