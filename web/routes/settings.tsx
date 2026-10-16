import type { ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSend, useSession, useSettings } from "../api";
import { Household } from "../household";
import { SettingsForm, SettingsIcon } from "../settings-form";
import { Tokens } from "../tokens";
import { Chevron, linkRow, panel, sectionHead } from "../ui";

export const Route = createFileRoute("/settings")({ component: SettingsPage });

const Go = ({ icon, children }: { icon: ReactNode; children: ReactNode }) => (
  <>
    <SettingsIcon>{icon}</SettingsIcon>
    <span className="flex-1">{children}</span>
    <Chevron className="size-4 -rotate-90 text-ink3" />
  </>
);

function SettingsPage() {
  const settings = useSettings()!;
  const signOut = useSend();
  return (
    <>
      <SettingsForm settings={settings} path="/api/settings" method="PUT" title="Settings" />
      {useSession()?.user?.role === "admin" && <Household />}
      <h2 className={sectionHead}>More</h2>
      <nav className={panel}>
        <Link to="/" search={{ view: "recurring" }} className={linkRow}>
          <Go icon={<path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4" />}>Recurring</Go>
        </Link>
        {settings.ai && (
          <Link to="/chat" className={linkRow}>
            <Go icon={<path d="M5 18.5V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H8.5z" />}>Past chats</Go>
          </Link>
        )}
        <Link to="/" search={{ view: "bin" }} className={linkRow}>
          <Go icon={<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" />}>Bin</Go>
        </Link>
        <a href="/api/export" download="expenses.csv" className={linkRow}>
          <Go icon={<path d="M12 4v11m-4-4 4 4 4-4M5 19h14" />}>Export all as CSV</Go>
        </a>
      </nav>
      <Tokens />
      <button className={`${panel} press mt-7 h-[52px] w-full font-medium text-up`} onClick={() => signOut.mutate(["POST", "/api/logout"])}>
        Sign out
      </button>
    </>
  );
}
