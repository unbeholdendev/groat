import { useContext, useId } from "react";
import { z } from "zod";
import { formatAmount, parseAmount, type Unit } from "../../../../shared/amount";
import { Chevron } from "../../../components/icon";
import { CurrencySelect, overlay, Picker } from "../../../components/picker";
import { Segmented } from "../../../components/segmented";
import { numeralSize } from "../../../components/total";
import { useApi, useSettings } from "../../../lib/api";
import { rate } from "../../../lib/money";
import { suggestion, type Transaction } from "../../../lib/schemas";
import { UnitContext } from "../../../lib/unit";
import type { TransactionFormApi } from "../schema";

const units = ["BTC", "sats"] as const;

const onField = "press hit inline-flex h-9 items-center rounded-chip px-3.5 text-[15px]";
const chip = "press hit num inline-flex h-7 items-center rounded-chip bg-surface2 px-2.5 text-xs font-medium";

const HeroError = ({ id, message }: { id: string; message?: string }) =>
  message ? (
    <p id={id} role="alert" className="mt-2 text-[13px] font-medium text-up">
      {message}
    </p>
  ) : null;

export function FormHeader({
  form,
  title,
  submit,
  pending,
  editing,
  row,
  onCancel,
}: {
  form: TransactionFormApi;
  title: string;
  submit: string;
  pending: boolean;
  editing: boolean;
  row?: Transaction;
  onCancel: () => void;
}) {
  const settings = useSettings()!;
  const [unit, setUnit] = useContext(UnitContext);
  const {
    register,
    watch,
    getValues,
    setValue,
    formState: { errors },
  } = form;
  const [note, amount, currency] = watch(["note", "amount", "currency"]);
  const suggestions =
    useApi(z.array(suggestion), ["/api/notes?prefix=", encodeURIComponent(note)], { enabled: !!note }).data ?? [];
  const symbol =
    currency === "BTC"
      ? ""
      : new Intl.NumberFormat("en-GB", { style: "currency", currency })
          .formatToParts(0)
          .find((p) => p.type === "currency")?.value;
  const ids = { amount: useId(), note: useId() };
  const size = numeralSize((symbol ?? "").length + (amount || "0.00").length);
  const invalid = (key: "amount" | "note") =>
    errors[key] ? { "aria-invalid": true, "aria-describedby": ids[key] } : {};

  const rated =
    row?.baseAmount && row.currency === currency && currency !== settings.baseCurrency
      ? rate(row.amount, currency, row.baseAmount, settings.baseCurrency, unit)
      : null;
  const switchable = currency === "BTC" || settings.baseCurrency === "BTC";

  function switchUnit(next: Unit) {
    const sats = currency === "BTC" && parseAmount(getValues("amount"), "BTC", unit);
    if (sats) setValue("amount", formatAmount(sats, "BTC", next));
    setUnit(next);
  }

  function showResult(text: string) {
    const result = /[-+*/×÷]/.test(text) && parseAmount(text, currency, unit);
    if (result) setValue("amount", formatAmount(result, currency, unit));
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
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div
          className={`flex min-w-0 flex-1 items-center gap-2 ${(symbol ?? "").length + amount.length > 8 ? "max-[400px]:basis-full" : ""}`}
        >
          {symbol && (
            <span aria-hidden className={`-mr-2 ${size} leading-none font-semibold tracking-[-0.04em] text-ink3`}>
              {symbol}
            </span>
          )}
          <input
            aria-label="Amount"
            className={`w-0 min-w-0 flex-1 bg-transparent ${size} leading-none font-semibold tracking-[-0.04em] text-ink outline-none placeholder:text-ink3/50`}
            placeholder="0.00"
            inputMode="decimal"
            autoFocus={!!note && !amount}
            {...invalid("amount")}
            {...register("amount", { onBlur: (e) => showResult(e.target.value) })}
          />
        </div>
        <Picker
          className={`${chip} relative shrink-0 gap-0.5`}
          chevron={<Chevron className="size-3 stroke-2 text-ink3" />}
        >
          {currency}
          <CurrencySelect recent={settings.recentCurrencies} className={overlay} {...register("currency")} />
        </Picker>
      </div>
      {(rated || switchable) && (
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="num text-[13px] text-ink3">{rated}</p>
          {switchable && (
            <div className="w-32 shrink-0">
              <Segmented label="Show bitcoin as" options={units} value={unit} onChange={switchUnit} />
            </div>
          )}
        </div>
      )}
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
