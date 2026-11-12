import type { ReactNode } from "react";
import { Chevron } from "../../components/icon";
import { overlay } from "../../components/picker";
import { divide } from "../../components/styles";
import { SettingsIcon } from "./settings-icon";

export const SelectRow = (props: {
  label: string;
  icon: ReactNode;
  value: string;
  shown?: ReactNode;
  onChange: (value: string) => void;
  children: ReactNode;
}) => (
  <label
    className={`relative flex h-[62px] items-center gap-3 px-4 has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-accent ${divide}`}
  >
    <SettingsIcon>{props.icon}</SettingsIcon>
    <span className="flex-1 font-medium whitespace-nowrap">{props.label}</span>
    <span className="num min-w-0 truncate text-ink2">{props.shown ?? props.value}</span>
    <Chevron className="size-4 shrink-0 text-ink3" />
    <select
      aria-label={props.label}
      className={overlay}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
    >
      {props.children}
    </select>
  </label>
);
