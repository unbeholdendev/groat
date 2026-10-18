import { Chevron } from "../../components/icon";
import { overlay } from "../../components/picker";
import { CurrencyOptions } from "./currency-options";
import { SettingsIcon } from "./settings-icon";

export const BaseCurrency = ({ value, onChange }: { value: string; onChange: (base: string) => void }) => (
  <label className="relative flex h-[62px] items-center gap-3 px-4 after:absolute after:inset-x-0 after:bottom-0 after:ml-16 after:h-px after:bg-line has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-accent">
    <SettingsIcon>
      <circle cx="12" cy="12" r="8" />
      <path d="M14.5 9.5a2.5 2 0 0 0-5 .5c0 2.5 5 1.5 5 4a2.5 2 0 0 1-5 .5M12 6v1.5M12 16.5V18" />
    </SettingsIcon>
    <span className="flex-1 font-medium">Base currency</span>
    <span className="num text-ink2">{value}</span>
    <Chevron className="size-4 text-ink3" />
    <select aria-label="Base currency" className={overlay} value={value} onChange={(e) => onChange(e.target.value)}>
      <CurrencyOptions />
    </select>
  </label>
);
