import type { ReactNode } from "react";
import { useSettings } from "../../lib/api";
import { Ai } from "./ai";
import { Backup } from "./backup";
import { Members } from "./members";
import { PasswordForm } from "./password-form";
import { SettingsForm } from "./settings-form";
import { SignOut } from "./sign-out";
import { Tokens } from "./tokens";

type Section = {
  id: string;
  label: string;
  icon: ReactNode;
  adminOnly?: boolean;
  Page: (props: { admin: boolean }) => ReactNode;
};

export const sections: Section[] = [
  {
    id: "general",
    label: "Currencies and theme",
    icon: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 4v16" />
      </>
    ),
    Page: () => <SettingsForm settings={useSettings()!} path="/api/settings" method="PUT" title="Settings" />,
  },
  {
    id: "ai",
    label: "AI",
    icon: (
      <path d="M12 4l1.8 4.2L18 10l-4.2 1.8L12 16l-1.8-4.2L6 10l4.2-1.8zM18 15l.8 1.7 1.7.8-1.7.8L18 20l-.8-1.7-1.7-.8 1.7-.8z" />
    ),
    Page: Ai,
  },
  {
    id: "members",
    label: "Members",
    icon: (
      <path d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3.5 19a5.5 5.5 0 0 1 11 0M15.5 5.3a3 3 0 0 1 0 5.4M17.5 13.6A5.5 5.5 0 0 1 20.5 19" />
    ),
    adminOnly: true,
    Page: Members,
  },
  { id: "backup", label: "Backup and export", icon: <path d="M12 4v11m-4-4 4 4 4-4M5 19h14" />, Page: Backup },
  {
    id: "tokens",
    label: "API tokens",
    icon: (
      <>
        <circle cx="8" cy="15" r="4" />
        <path d="m11 12 8-8M16 7l2.5 2.5M14 9l2 2" />
      </>
    ),
    Page: Tokens,
  },
  {
    id: "account",
    label: "Account",
    icon: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5 20a7 7 0 0 1 14 0" />,
    Page: () => (
      <>
        <PasswordForm />
        <SignOut />
      </>
    ),
  },
];

export const sectionsFor = (admin: boolean) => sections.filter((s) => admin || !s.adminOnly);
