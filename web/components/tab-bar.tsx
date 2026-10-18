import type { ReactNode } from "react";
import { Link, useLocation, useSearch } from "@tanstack/react-router";
import { Icon } from "./icon";

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

export function TabBar() {
  const path = useLocation().pathname;
  const { view } = useSearch({ strict: false });
  const current = path === "/chat" || view ? "/settings" : path;
  return (
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
  );
}
