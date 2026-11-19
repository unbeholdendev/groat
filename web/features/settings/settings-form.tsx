import { type FormEvent, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "../../components/button";
import { FormError } from "../../components/form";
import { Masthead } from "../../components/masthead";
import { divide, panel, sectionHead } from "../../components/styles";
import { useSend } from "../../lib/api";
import type { z } from "zod";
import type { settings } from "../../lib/schemas";
import { BaseCurrency } from "./base-currency";
import { SettingsIcon } from "./settings-icon";
import { ThemeSection } from "./theme-section";

export function SettingsForm(props: {
  settings: z.infer<typeof settings>;
  path: string;
  method: string;
  title: string;
  onSaved?: () => void;
}) {
  const onboarding = !props.settings.onboarded;
  const [baseCurrency, setBase] = useState(props.settings.baseCurrency);
  const mutation = useSend("settings", props.onSaved);
  const queryClient = useQueryClient();
  useEffect(() => setBase(props.settings.baseCurrency), [props.settings.baseCurrency]);

  function change(base: string) {
    setBase(base);
    if (!onboarding)
      mutation.mutate([props.method, props.path, { baseCurrency: base }], {
        onError: () => setBase(props.settings.baseCurrency),
      });
  }

  function update(change: Partial<Pick<z.infer<typeof settings>, "theme" | "sats">>) {
    queryClient.setQueryData(["/api/settings"], { ...props.settings, ...change });
    mutation.mutate([props.method, props.path, change], {
      onError: () => queryClient.setQueryData(["/api/settings"], props.settings),
    });
  }

  function save(e: FormEvent) {
    e.preventDefault();
    mutation.mutate([props.method, props.path, { baseCurrency }]);
  }

  return (
    <form onSubmit={save} className="flex flex-col">
      {onboarding && (
        <Masthead title={props.title}>Pick the currency totals are shown in. You can change it later.</Masthead>
      )}
      <h2 className={sectionHead}>Currencies</h2>
      <div className={panel}>
        <fieldset disabled={mutation.isPending}>
          <BaseCurrency value={baseCurrency} onChange={change} />
          {!onboarding && baseCurrency !== "BTC" && (
            <label className={`flex h-[62px] items-center gap-3 px-4 ${divide}`}>
              <SettingsIcon>
                <path d="M9 6h5a3 3 0 0 1 0 6H9zm0 6h6a3 3 0 0 1 0 6H9zm0-6v12M7 6h2m-2 12h2m2-14v2m0 12v2m3-16v2m0 12v2" />
              </SettingsIcon>
              <span className="flex-1 font-medium">Show spending in sats</span>
              <input
                type="checkbox"
                className="size-5 accent-accent"
                checked={props.settings.sats}
                onChange={(e) => update({ sats: e.target.checked })}
              />
            </label>
          )}
        </fieldset>
      </div>
      {!onboarding && (
        <fieldset disabled={mutation.isPending}>
          <ThemeSection value={props.settings.theme} onChange={(theme) => update({ theme })} />
        </fieldset>
      )}
      {!onboarding && (
        <p className="mt-2 px-1 text-sm text-ink2">
          Totals use the base currency. Each expense keeps its original currency.
        </p>
      )}
      {!onboarding && (
        <p role="status" className="mt-3 text-sm text-ink2">
          {saveStatus(mutation)}
        </p>
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

function saveStatus(m: { isPaused: boolean; isPending: boolean; isSuccess: boolean }) {
  if (m.isPaused) return "Waiting for a connection to save…";
  if (m.isPending) return "Saving settings…";
  return m.isSuccess ? "Settings saved." : "";
}
