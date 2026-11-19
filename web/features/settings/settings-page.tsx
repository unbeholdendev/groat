import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Chevron, paths } from "../../components/icon";
import { linkRow, panel, sectionHead } from "../../components/styles";
import { useSession } from "../../lib/api";
import { sectionsFor } from "./sections";
import { SettingsIcon } from "./settings-icon";

const Go = ({ icon, children }: { icon: ReactNode; children: ReactNode }) => (
  <>
    <SettingsIcon>{icon}</SettingsIcon>
    <span className="flex-1">{children}</span>
    <Chevron className="size-4 -rotate-90 text-ink3" />
  </>
);

export function SettingsPage() {
  const session = useSession();
  const admin = session?.user?.role === "admin";
  return (
    <>
      <h1 className="text-display font-bold">Settings</h1>
      <nav aria-label="Settings" className={`${panel} mt-5`}>
        {sectionsFor(admin).map((s) => (
          <Link key={s.id} to="/settings/$section" params={{ section: s.id }} className={linkRow}>
            <Go icon={s.icon}>{s.label}</Go>
          </Link>
        ))}
      </nav>
      <h2 className={`${sectionHead} lg:hidden`}>More</h2>
      <nav aria-label="More" className={`${panel} lg:mt-7`}>
        <Link to="/" search={{ view: "recurring" }} className={`${linkRow} lg:hidden`}>
          <Go icon={<path d={paths.repeat} />}>Recurring</Go>
        </Link>
        <Link to="/chat" className={`${linkRow} lg:hidden`}>
          <Go icon={<path d={paths.chat} />}>Past chats</Go>
        </Link>
        <Link to="/" search={{ view: "bin" }} className={`${linkRow} lg:hidden`}>
          <Go icon={<path d={paths.bin} />}>Bin</Go>
        </Link>
        <Link to="/settings/privacy" className={linkRow}>
          <Go icon={<path d="M12 3 4 6v6c0 4 8 9 8 9s8-5 8-9V6z" />}>Privacy and data flows</Go>
        </Link>
      </nav>
      {session?.version && <p className="mt-4 text-center text-xs text-ink3">Groat {session.version}</p>}
    </>
  );
}
