import { useEffect, useState } from "react";
import { Outlet, useLocation } from "@tanstack/react-router";
import type { Unit } from "../../../shared/amount";
import { useApi } from "../../lib/api";
import { session as sessionSchema, settings as settingsSchema } from "../../lib/schemas";
import { useTheme } from "../../lib/theme";
import { UnitContext } from "../../lib/unit";
import { SignIn } from "../auth/sign-in";
import { SettingsForm } from "../settings/settings-form";
import { useStorageWarning } from "../../lib/device";
import { Outbox } from "../transactions/outbox";
import { Dock } from "./dock";
import { Gate, LoadError } from "./gates";

export function App() {
  const { data: session, error, refetch } = useApi(sessionSchema, ["/api/session"]);
  const config = useApi(settingsSchema, ["/api/settings"], { enabled: !!session?.user });
  const location = useLocation();
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const fit = () => {
      document.documentElement.style.setProperty("--app-height", `${viewport.height}px`);
      document.documentElement.style.setProperty("--app-top", `${viewport.offsetTop}px`);
    };
    fit();
    viewport.addEventListener("resize", fit);
    viewport.addEventListener("scroll", fit);
    return () => {
      viewport.removeEventListener("resize", fit);
      viewport.removeEventListener("scroll", fit);
      document.documentElement.style.removeProperty("--app-height");
      document.documentElement.style.removeProperty("--app-top");
    };
  }, []);
  useEffect(() => document.querySelector("main")?.scrollTo(0, 0), [location.pathname, location.search.new, location.search.edit]);
  const storageWarning = useStorageWarning();
  const settings = config.data;
  const unitState = useState<Unit>("BTC");
  const [guide, setGuide] = useState(false);
  useTheme(settings?.theme);

  if (!session) return error ? <LoadError error={error} onRetry={() => refetch()} /> : <Gate><p role="status" className="pt-12 text-ink2">Loading Groat…</p></Gate>;
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
      <div className="fixed inset-x-0 top-[var(--app-top,0px)] flex h-[var(--app-height,100dvh)] flex-col">
        <main className="mx-auto min-h-0 w-full max-w-md flex-1 overflow-y-auto overscroll-y-contain px-5 pt-[max(env(safe-area-inset-top),20px)] pb-[calc(var(--stack,0px)+1.5rem)]">
          {storageWarning && <p role="alert" className="mb-4 text-sm text-up">{storageWarning}</p>}
          <Outbox />
          <Outlet />
        </main>
        <Dock settings={settings} guide={guide} onGuided={() => setGuide(false)} />
      </div>
    </UnitContext>
  );
}
