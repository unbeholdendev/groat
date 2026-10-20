import { useContext, useId } from "react";
import { z } from "zod";
import { formatAmount, parseAmount } from "../../../../shared/amount";
import { Chevron } from "../../../components/icon";
import { CurrencySelect, overlay, Picker } from "../../../components/picker";
import { useApi, useSettings } from "../../../lib/api";
import { suggestion } from "../../../lib/schemas";
import { UnitContext } from "../../../lib/unit";
import type { ExpenseFormApi } from "../schema";

const onField = "press hit inline-flex h-9 items-center rounded-chip px-3.5 text-[15px]";

const HeroError = ({ id, message }: { id: string; message?: string }) =>
  message ? (
    <p id={id} role="alert" className="mt-2 text-[13px] font-medium text-up">
      {message}
    </p>
  ) : null;

export function FormHeader({ form, title, submit, pending, editing, onCancel }: { form: ExpenseFormApi; title: string; submit: string; pending: boolean; editing: boolean; onCancel: () => void }) {
  const settings = useSettings()!;
  const [unit, setUnit] = useContext(UnitContext);
  const { register, watch, getValues, setValue, formState: { errors } } = form;
  const [note, amount, currency] = watch(["note", "amount", "currency"]);
  const suggestions = useApi(z.array(suggestion), ["/api/notes?prefix=", encodeURIComponent(note)], { enabled: !!note }).data ?? [];
  const symbol = currency === "BTC" ? "" : new Intl.NumberFormat("en-GB", { style: "currency", currency }).formatToParts(0).find((p) => p.type === "currency")?.value;
  const ids = { amount: useId(), note: useId() };
  const invalid = (key: "amount" | "note") => (errors[key] ? { "aria-invalid": true, "aria-describedby": ids[key] } : {});

  function toggleUnit() {
    const next = unit === "BTC" ? "sats" : "BTC";
    const sats = currency === "BTC" && parseAmount(getValues("amount"), "BTC", unit);
    if (sats) setValue("amount", formatAmount(sats, "BTC", next));
    setUnit(next);
  }

  function pickNote(value: string) {
    const match = suggestions.find((s) => s.note === value);
    if (!match || editing) return;
    setValue("amount", formatAmount(match.amount, match.currency, unit));
    setValue("currency", match.currency);
    setValue("categoryId", match.categoryId);
  }

  return (
    <header className="pb-2">
      <div className="flex items-center justify-between gap-2">
        <button type="button" className={`${onField} bg-surface2 font-medium`} onClick={onCancel}>
          Cancel
        </button>
        <h1 className="truncate text-[17px] font-semibold">{title}</h1>
        <button className={`${onField} bg-accent font-semibold text-on-accent disabled:opacity-50`} disabled={pending}>
          {submit}
        </button>
      </div>
      <div className="mt-6 flex items-center gap-2">
        {symbol && (
          <span aria-hidden className="-mr-2 text-[60px] leading-none font-semibold tracking-[-0.04em] text-ink3">
            {symbol}
          </span>
        )}
        <input
          aria-label="Amount"
          className="w-0 min-w-0 flex-1 bg-transparent text-[60px] leading-none font-semibold tracking-[-0.04em] text-ink outline-none placeholder:text-ink3/50"
          placeholder="0.00"
          inputMode="decimal"
          autoFocus={!!note && !amount}
          {...invalid("amount")}
          {...register("amount")}
        />
        {(currency === "BTC" || settings.baseCurrency === "BTC") && (
          <button type="button" aria-label="Unit" className={`${onField} num bg-surface2 text-[13px] font-medium`} onClick={toggleUnit}>
            {unit}
          </button>
        )}
        <Picker className={`${onField} num relative gap-1 bg-surface2 text-[13px] font-medium`} chevron={<Chevron className="size-3.5 stroke-2 text-ink3" />}>
          {currency}
          <CurrencySelect recent={settings.recentCurrencies} className={overlay} {...register("currency")} />
        </Picker>
      </div>
      <HeroError id={ids.amount} message={errors.amount?.message} />
      <input
        aria-label="Note"
        placeholder="What was it for?"
        className="mt-5 h-12 w-full rounded-field bg-surface2 px-4 text-[17px] font-medium text-ink outline-none placeholder:text-ink3 focus:bg-surface focus:ring-2 focus:ring-accent"
        list="notes"
        autoFocus={!note}
        {...invalid("note")}
        {...register("note", { onChange: (e) => pickNote(e.target.value) })}
      />
      <HeroError id={ids.note} message={errors.note?.message} />
      <datalist id="notes">
        {suggestions.map((s) => (
          <option key={s.note} value={s.note} />
        ))}
      </datalist>
    </header>
  );
}
