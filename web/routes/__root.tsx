import { type ReactNode, useEffect, useState } from "react";
import { createRootRoute, Link, Outlet, useLocation, useNavigate, useSearch } from "@tanstack/react-router";
import type { Unit } from "../../shared/amount";
import { session as sessionSchema, type Settings, useApi, useCategories, useSettings } from "../api";
import { Bar } from "../bar";
import { SettingsForm } from "../settings-form";
import { SignIn } from "../sign-in";
import { Icon, UnitContext } from "../ui";

export const Route = createRootRoute({ component: App });

function useTheme(theme?: Settings["theme"]) {
  useEffect(() => {
    if (!theme) return;
    try {
      localStorage.setItem("theme", theme);
    } catch {}
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.classList.toggle("dark", theme === "dark" || (theme !== "light" && media.matches));
      document.querySelector("meta[name=theme-color]")?.setAttribute("content", getComputedStyle(document.body).backgroundColor);
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
}

const tabs: [string, string, ReactNode][] = [
  ["/", "Expenses", <path d="M6 3.5h12v17l-2.5-1.5-2 1.5-1.5-1-1.5 1-2-1.5L6 20.5zM9.5 8.5h5M9.5 12h5M9.5 15.5h3" />],
  ["/stats", "Stats", <path d="m4 17 5-5 3.5 3L20 7.5M15 7.5h5v5" />],
  [
    "/categories",
    "Categories",
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </>,
  ],
  [
    "/settings",
    "Settings",
    <>
      <path d="M4 8h9M19 8h1M4 16h1M11 16h9" />
      <circle cx="16" cy="8" r="3" />
      <circle cx="8" cy="16" r="3" />
    </>,
  ],
];

function App() {
  const { data: session, error, refetch } = useApi(sessionSchema, ["/api/session"]);
  const settings = useSettings();
  const unitState = useState<Unit>("BTC");
  const search = useSearch({ strict: false });
  const path = useLocation().pathname;
  const current = path === "/chat" || search.view ? "/settings" : path;
  const navigate = useNavigate();
  const categories = useCategories();
  const [guide, setGuide] = useState(false);
  const bar = !search.new && !search.edit;
  useTheme(settings?.theme);

  if (!session)
    return (
      error && (
        <main className="mx-auto max-w-md px-5 pt-12">
          <h1 className="text-display font-bold">Can’t load Expenses</h1>
          <p className="mt-2 text-ink2">{error.message}</p>
          <button className="quiet mt-5" onClick={() => refetch()}>
            Try again
          </button>
        </main>
      )
    );
  if (!session.user)
    return (
      <main className="mx-auto max-w-md px-5 pb-10 lg:pt-12">
        <SignIn setup={session.setup} />
      </main>
    );
  if (!settings) return null;
  if (!settings.onboarded)
    return (
      <main className="mx-auto max-w-md px-5 pb-10 lg:pt-12">
        <SettingsForm settings={settings} path="/api/onboarding" method="POST" title="Welcome" onSaved={() => setGuide(true)} />
      </main>
    );
  return (
    <UnitContext value={unitState}>
      <main className="mx-auto max-w-md px-5 pt-[max(env(safe-area-inset-top),20px)] pb-[calc(10rem+env(safe-area-inset-bottom))] lg:pb-4">
        <Outlet />
      </main>
      <div className="fixed inset-x-2 bottom-[max(env(safe-area-inset-bottom),8px)] z-10 mx-auto max-w-md p-2 max-lg:[view-transition-name:dock] lg:sticky lg:bottom-6">
        <div aria-hidden className={`glass absolute inset-0 -z-10 rounded-dock shadow-dock ${bar ? "" : "lg:hidden"}`} />
        {bar && (
          <Bar
            settings={settings}
            unit={unitState[0]}
            categories={categories}
            guide={guide}
            onGuided={() => setGuide(false)}
            chat={path === "/chat" ? Number(search.id) || 0 : undefined}
            onForm={(draft) => navigate({ to: "/", search: { new: "1" }, state: { draft } })}
            onChat={(id) => navigate({ to: "/chat", search: { id: String(id) } })}
          />
        )}
        <nav aria-label="Main" className="grid grid-cols-4 lg:[view-transition-name:tabs] lg:fixed lg:top-6 lg:left-[calc(50%-432px)] lg:flex lg:w-44 lg:flex-col lg:gap-1">
          {tabs.map(([to, label, icon]) => (
            <Link
              key={to}
              viewTransition
              to={to}
              activeOptions={{ exact: to === "/" }}
              aria-current={current === to ? "page" : undefined}
              className={`press flex h-[52px] flex-col items-center justify-center gap-1 rounded-field text-[11px] font-semibold lg:h-11 lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:text-[15px] lg:font-medium ${current === to ? "text-ink lg:bg-surface2" : "text-ink3 lg:text-ink2 lg:hover:bg-surface2 lg:hover:text-ink"}`}
            >
              <Icon className={`size-[22px] ${current === to ? "text-accent" : ""}`}>{icon}</Icon>
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </UnitContext>
  );
}

