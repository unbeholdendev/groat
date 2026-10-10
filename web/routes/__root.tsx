import { useEffect, useState } from "react";
import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import type { Unit } from "../../shared/amount";
import { type Settings, SettingsForm, UnitContext, useSettings } from "../shared";

export const Route = createRootRoute({ component: App });

function useTheme(theme?: Settings["theme"]) {
  useEffect(() => {
    if (!theme) return;
    try {
      localStorage.setItem("theme", theme);
    } catch {}
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () =>
      document.documentElement.classList.toggle("dark", theme === "dark" || (theme !== "light" && media.matches));
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
}

function App() {
  const settings = useSettings();
  const unitState = useState<Unit>("BTC");
  useTheme(settings?.theme);

  if (!settings) return null;
  if (!settings.onboarded)
    return <SettingsForm settings={settings} path="/api/onboarding" method="POST" title="Welcome" />;
  return (
    <main className="mx-auto max-w-md p-4">
      <nav className="mb-4 flex gap-4 text-sm">
        {(["/", "/stats", ...(settings.ai ? (["/chat"] as const) : []), "/categories", "/settings"] as const).map((p) => (
          <Link
            key={p}
            to={p}
            className="capitalize"
            activeOptions={{ exact: true }}
            activeProps={{ className: "font-semibold" }}
            inactiveProps={{ className: "text-zinc-500" }}
          >
            {p.slice(1) || "expenses"}
          </Link>
        ))}
      </nav>
      <UnitContext value={unitState}>
        <Outlet />
      </UnitContext>
    </main>
  );
}
