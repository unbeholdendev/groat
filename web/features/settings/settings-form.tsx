import { type FormEvent, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "../../components/button";
import { FormError } from "../../components/form";
import { Masthead } from "../../components/masthead";
import { panel, sectionHead } from "../../components/styles";
import { useSend } from "../../lib/api";
import type { Settings } from "../../lib/schemas";
import { BaseCurrency } from "./base-currency";
import { ThemeSection } from "./theme-section";

export function SettingsForm(props: { settings: Settings; path: string; method: string; title: string; onSaved?: () => void }) {
  const onboarding = !props.settings.onboarded;
  const [baseCurrency, setBase] = useState(props.settings.baseCurrency);
  const mutation = useSend("settings", props.onSaved);
  const queryClient = useQueryClient();
  useEffect(() => setBase(props.settings.baseCurrency), [props.settings.baseCurrency]);

  function change(base: string) {
    setBase(base);
    if (!onboarding) mutation.mutate([props.method, props.path, { baseCurrency: base }]);
  }

  function save(e: FormEvent) {
    e.preventDefault();
    mutation.mutate([props.method, props.path, { baseCurrency }]);
  }

  return (
    <form onSubmit={save} className="flex flex-col">
      {onboarding ? (
        <Masthead title={props.title}>Pick the currency totals are shown in. You can change it later.</Masthead>
      ) : (
        <h1 className="text-display font-bold">{props.title}</h1>
      )}
      <h2 className={sectionHead}>Currencies</h2>
      <div className={panel}>
        <BaseCurrency value={baseCurrency} onChange={change} />
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
