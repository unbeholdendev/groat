import { createFileRoute, Link } from "@tanstack/react-router";
import { Chevron, SettingsForm, useSettings } from "../shared";

const rowClass = "flex items-center justify-between border-b border-line py-3";
const more = <Chevron className="size-4 -rotate-90 text-ink3" />;

export const Route = createFileRoute("/settings")({
  component: () => (
    <>
      <SettingsForm settings={useSettings()!} path="/api/settings" method="PUT" title="Settings" />
      <nav className="mt-6 border-t border-line">
        <Link to="/" search={{ view: "recurring" }} className={rowClass}>
          Recurring
          {more}
        </Link>
        <Link to="/" search={{ view: "bin" }} className={rowClass}>
          Bin
          {more}
        </Link>
        <a href="/api/export" download="expenses.csv" className={rowClass}>
          Export all as CSV
          {more}
        </a>
      </nav>
    </>
  ),
});
