import { type FormEvent, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "../../components/button";
import { FormError } from "../../components/form";
import { Masthead } from "../../components/masthead";
import { panel, sectionHead } from "../../components/styles";
import { useSend } from "../../lib/api";
import type { Settings } from "../../lib/schemas";
import { BaseCurrency } from "./base-currency";
import { OtherCurrencies } from "./other-currencies";
import { ThemeSection } from "./theme-section";

export function SettingsForm(props: { settings: Settings; path: string; method: string; title: string; onSaved?: () => void }) {
  const onboarding = !props.settings.onboarded;
  const [baseCurrency, setBase] = useState(props.settings.baseCurrency);
  const [others, setOthers] = useState(props.settings.currencies.filter((c) => c !== props.settings.baseCurrency));
  const mutation = useSend("settings", props.onSaved);
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
        <BaseCurrency value={baseCurrency} onChange={(base) => change(base, [...(onboarding ? [] : [baseCurrency]), ...others].filter((c) => c !== base))} />
        <OtherCurrencies base={baseCurrency} others={others} onChange={(list) => change(baseCurrency, list)} />
      </div>
      {!onboarding && (
        <ThemeSection
          value={props.settings.theme}
          onChange={(theme) => (queryClient.setQueryData(["/api/settings"], { ...props.settings, theme }), mutation.mutate([props.method, props.path, { theme }]))}
        />
      )}
      <FormError error={mutation.error} className="mt-3 px-1" />
      {onboarding && (
        <Button variant="primary" type="submit" className="mt-7" disabled={mutation.isPending}>
          Start
        </Button>
      )}
    </form>
  );
}
