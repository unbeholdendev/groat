import { CurrencyOptions } from "./currency-options";
import { SelectRow } from "./select-row";

export const BaseCurrency = ({ value, onChange }: { value: string; onChange: (base: string) => void }) => (
  <SelectRow
    label="Base currency"
    value={value}
    onChange={onChange}
    icon={
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M14.5 9.5a2.5 2 0 0 0-5 .5c0 2.5 5 1.5 5 4a2.5 2 0 0 1-5 .5M12 6v1.5M12 16.5V18" />
      </>
    }
  >
    <CurrencyOptions />
  </SelectRow>
);
