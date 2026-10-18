import { Button } from "../../components/button";
import { divide } from "../../components/styles";
import { dayLabel } from "../../lib/dates";
import type { ApiToken } from "../../lib/schemas";
import { SettingsIcon } from "./settings-icon";

export const TokenRow = ({ token: t, onRevoke }: { token: ApiToken; onRevoke: () => void }) => (
  <li className={`flex h-[62px] items-center gap-3 px-4 ${divide}`}>
    <SettingsIcon>
      <circle cx="8" cy="15" r="4" />
      <path d="m11 12 8-8m-3 3 2 2" />
    </SettingsIcon>
    <span className="min-w-0 flex-1">
      <span className="block truncate font-medium">{t.name}</span>
      <span className="block text-xs font-medium text-ink3">{t.lastUsedAt ? `Last used ${dayLabel(t.lastUsedAt.slice(0, 10))}` : "Never used"}</span>
    </span>
    <Button tone="up" onClick={onRevoke}>
      Revoke
    </Button>
  </li>
);
