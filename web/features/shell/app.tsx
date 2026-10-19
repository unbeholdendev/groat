import { useState } from "react";
import { Outlet } from "@tanstack/react-router";
import type { Unit } from "../../../shared/amount";
import { useApi } from "../../lib/api";
import { session as sessionSchema, settings as settingsSchema } from "../../lib/schemas";
import { useTheme } from "../../lib/theme";
import { UnitContext } from "../../lib/unit";
import { SignIn } from "../auth/sign-in";
import { SettingsForm } from "../settings/settings-form";
import { Dock } from "./dock";
import { Gate, LoadError } from "./gates";

export function App() {
  const { data: session, error, refetch } = useApi(sessionSchema, ["/api/session"]);
  const config = useApi(settingsSchema, ["/api/settings"]);
  const settings = config.data;
  const unitState = useState<Unit>("BTC");
  const [guide, setGuide] = useState(false);
  useTheme(settings?.theme);

  if (!session) return error && <LoadError error={error} onRetry={() => refetch()} />;
  if (!session.user)
    return (
      <Gate>
        <SignIn setup={session.setup} />
      </Gate>
    );
  if (!settings) return config.isError && !config.isFetching && <LoadError error={config.error} onRetry={() => config.refetch()} />;
  if (!settings.onboarded)
    return (
      <Gate>
        <SettingsForm settings={settings} path="/api/onboarding" method="POST" title="Welcome" onSaved={() => setGuide(true)} />
      </Gate>
    );
  return (
    <UnitContext value={unitState}>
      <main className="mx-auto max-w-md px-5 pt-[max(env(safe-area-inset-top),20px)] pb-[calc(var(--dock,124px)+2.25rem+env(safe-area-inset-bottom))] lg:pb-[calc(var(--stack,8px)+0.5rem)]">
        <Outlet />
      </main>
      <Dock settings={settings} guide={guide} onGuided={() => setGuide(false)} />
    </UnitContext>
  );
}
