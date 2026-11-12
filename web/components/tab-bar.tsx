import { type ReactNode, useSyncExternalStore } from "react";
import { Link, useLocation, useSearch } from "@tanstack/react-router";
import { Icon, paths } from "./icon";

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

const views = [
  ["recurring", "Recurring", paths.repeat, { to: "/", search: { view: "recurring" } }],
  ["/chat", "Chats", paths.chat, { to: "/chat" }],
  ["bin", "Bin", paths.bin, { to: "/", search: { view: "bin" } }],
] as const;

const lg = () => matchMedia("(min-width: 64rem)");
const onResize = (f: () => void) => {
  const m = lg();
  m.addEventListener("change", f);
  return () => m.removeEventListener("change", f);
};

export function TabBar() {
  const path = useLocation().pathname;
  const { view } = useSearch({ strict: false });
  const wide = useSyncExternalStore(onResize, () => lg().matches);
  const current = view && !wide ? "/settings" : (view ?? path);
  return (
    <nav
      aria-label="Main"
      className="grid grid-cols-4 gap-1 max-lg:rounded-panel max-lg:bg-ink max-lg:dark:bg-surface2 max-lg:p-1 lg:[view-transition-name:tabs] lg:fixed lg:top-6 lg:left-[calc(50%-432px)] lg:flex lg:w-44 lg:flex-col lg:gap-1"
    >
      {tabs.map(([to, label, icon]) => (
        <Link
          key={to}
          viewTransition
          to={to}
          activeOptions={{ exact: to === "/" }}
          aria-current={current === to ? "page" : undefined}
          className={`press flex h-[52px] flex-col items-center justify-center gap-1 rounded-field text-[12px] font-semibold lg:h-11 lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:text-[15px] lg:font-medium ${current === to ? "max-lg:bg-accent max-lg:text-on-accent lg:text-ink lg:bg-surface2" : "max-lg:text-bg/75 max-lg:dark:text-ink2 lg:text-ink2 lg:hover:bg-surface2 lg:hover:text-ink"}`}
        >
          <Icon className={`size-[22px] ${current === to ? "lg:text-accent" : ""}`}>{icon}</Icon>
          {label}
        </Link>
      ))}
      <hr className="mx-3 my-2 hidden border-line lg:block" />
      {views.map(([id, label, d, link]) => (
        <Link
          key={id}
          viewTransition
          {...link}
          aria-current={current === id ? "page" : undefined}
          className={`press hidden h-10 items-center gap-3.5 rounded-field px-3 text-[14px] font-medium lg:flex ${current === id ? "bg-surface2 text-ink" : "text-ink3 hover:bg-surface2 hover:text-ink"}`}
        >
          <Icon d={d} className={`ml-0.5 size-[18px] stroke-2 ${current === id ? "text-accent" : ""}`} />
          {label}
        </Link>
      ))}
    </nav>
  );
}
