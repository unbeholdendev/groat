import type { ReactNode } from "react";
import { Icon } from "../../components/icon";

export const SettingsIcon = ({ children }: { children: ReactNode }) => (
  <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-tile bg-track text-ink2">
    <Icon className="size-[18px] stroke-2">{children}</Icon>
  </span>
);
