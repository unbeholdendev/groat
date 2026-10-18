import { Icon, paths } from "../../components/icon";
import { chip } from "../../components/styles";
import { CurrencyOptions, nameOf } from "./currency-options";

export const OtherCurrencies = ({ base, others, onChange }: { base: string; others: string[]; onChange: (list: string[]) => void }) => (
  <div role="group" aria-labelledby="others" className="px-4 pt-3 pb-4">
    <p id="others" className="mb-3 text-[13px] font-medium text-ink2">
      Others you spend in
    </p>
    <div className="flex flex-wrap gap-x-1.5 gap-y-3">
      {others.map((c) => (
        <button type="button" key={c} aria-label={`Remove ${c}`} title={nameOf(c)} className={`${chip} hit num`} onClick={() => onChange(others.filter((o) => o !== c))}>
          {c}
          <Icon d={paths.close} className="size-2.5 stroke-2 text-ink3" />
        </button>
      ))}
      <label className={`${chip} text-ink2`}>
        <Icon d={paths.plus} className="size-2.5 stroke-2" />
        Add
        <select aria-label="Add a currency" className="absolute inset-x-0 -inset-y-2.5 opacity-0" value="" onChange={(e) => onChange([...others, e.target.value])}>
          <option value="" disabled>
            Add a currency
          </option>
          <CurrencyOptions except={[base, ...others]} />
        </select>
      </label>
    </div>
  </div>
);
