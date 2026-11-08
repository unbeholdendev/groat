import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Chevron, paths } from "../../components/icon";
import { linkRow, panel, sectionHead } from "../../components/styles";
import { useSession, useSettings } from "../../lib/api";
import { AiModels } from "./ai-models";
import { Backup } from "./backup";
import { Rates } from "./rates";
import { Members } from "./members";
import { PasswordForm } from "./password-form";
import { SettingsForm } from "./settings-form";
import { SettingsIcon } from "./settings-icon";
import { SignOut } from "./sign-out";
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
  const admin = useSession()?.user?.role === "admin";
  return (
    <>
      <SettingsForm settings={settings} path="/api/settings" method="PUT" title="Settings" />
      <Rates />
      {admin && <Members />}
      {admin && <AiModels />}
      <Backup admin={admin} />
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
        <a href="/privacy.html" className={linkRow}>
          <Go d="M12 3 4 6v6c0 4 8 9 8 9s8-5 8-9V6z">Privacy and data flows</Go>
        </a>
      </nav>
      <Tokens />
      <PasswordForm />
      <SignOut />
    </>
  );
}
