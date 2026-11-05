import { useState } from "react";
import { Outlet } from "@tanstack/react-router";
import type { Unit } from "../../../shared/amount";
import { useApi } from "../../lib/api";
import { session as sessionSchema, settings as settingsSchema } from "../../lib/schemas";
import { useTheme } from "../../lib/theme";
import { UnitContext } from "../../lib/unit";
import { SignIn } from "../auth/sign-in";
import { SettingsForm } from "../settings/settings-form";
import { useStorageWarning } from "../../lib/device";
import { Outbox } from "../expenses/outbox";
import { Dock } from "./dock";
import { Gate, LoadError } from "./gates";

export function App() {
  const { data: session, error, refetch } = useApi(sessionSchema, ["/api/session"]);
  const config = useApi(settingsSchema, ["/api/settings"], { enabled: !!session?.user });
  const storageWarning = useStorageWarning();
  const settings = config.data;
  const unitState = useState<Unit>("BTC");
  const [guide, setGuide] = useState(false);
  useTheme(settings?.theme);

  if (!session) return error ? <LoadError error={error} onRetry={() => refetch()} /> : <Gate><p role="status" className="pt-12 text-ink2">Loading Expenses…</p></Gate>;
  if (!session.user)
    return (
      <Gate>
        <SignIn setup={session.setup} />
      </Gate>
    );
  if (!settings || config.isPlaceholderData) return config.isError ? <LoadError error={config.error} onRetry={() => config.refetch()} /> : <Gate><p role="status" className="pt-12 text-ink2">Loading settings…</p></Gate>;
  if (!settings.onboarded)
    return (
      <Gate>
        <SettingsForm settings={settings} path="/api/onboarding" method="POST" title="Welcome" onSaved={() => setGuide(true)} />
      </Gate>
    );
  return (
    <UnitContext value={unitState}>
      <main className="mx-auto max-w-md px-5 pt-[max(env(safe-area-inset-top),20px)] pb-[calc(var(--dock,124px)+2.25rem+env(safe-area-inset-bottom))] lg:pb-[calc(var(--stack,8px)+0.5rem)]">
        {storageWarning && <p role="alert" className="mb-4 text-sm text-up">{storageWarning}</p>}
        <Outbox />
        <Outlet />
      </main>
      <Dock settings={settings} guide={guide} onGuided={() => setGuide(false)} />
    </UnitContext>
  );
}
