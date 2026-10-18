import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Chevron, paths } from "../../components/icon";
import { linkRow, panel, sectionHead } from "../../components/styles";
import { useSend, useSession, useSettings } from "../../lib/api";
import { Household } from "./household";
import { SettingsForm } from "./settings-form";
import { SettingsIcon } from "./settings-icon";
import { Tokens } from "./tokens";

const Go = ({ d, children }: { d: string; children: ReactNode }) => (
  <>
    <SettingsIcon>
      <path d={d} />
    </SettingsIcon>
    <span className="flex-1">{children}</span>
    <Chevron className="size-4 -rotate-90 text-ink3" />
  </>
);

export function SettingsPage() {
  const settings = useSettings()!;
  const signOut = useSend();
  return (
    <>
      <SettingsForm settings={settings} path="/api/settings" method="PUT" title="Settings" />
      {useSession()?.user?.role === "admin" && <Household />}
      <h2 className={sectionHead}>More</h2>
      <nav className={panel}>
        <Link to="/" search={{ view: "recurring" }} className={linkRow}>
          <Go d={paths.repeat}>Recurring</Go>
        </Link>
        {settings.ai && (
          <Link to="/chat" className={linkRow}>
            <Go d="M5 18.5V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H8.5z">Past chats</Go>
          </Link>
        )}
        <Link to="/" search={{ view: "bin" }} className={linkRow}>
          <Go d={paths.bin}>Bin</Go>
        </Link>
        <a href="/api/export" download="expenses.csv" className={linkRow}>
          <Go d="M12 4v11m-4-4 4 4 4-4M5 19h14">Export all as CSV</Go>
        </a>
      </nav>
      <Tokens />
      <button type="button" className={`${panel} press mt-7 h-[52px] w-full font-medium text-up`} onClick={() => signOut.mutate(["POST", "/api/logout"])}>
        Sign out
      </button>
    </>
  );
}
