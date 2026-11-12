import { ReceiptPreview } from "./receipt-preview";
import { useId } from "react";
import type { Unit } from "../../../shared/amount";
import { Button } from "../../components/button";
import { CategoryOptions, Tile } from "../../components/category";
import { CurrencySelect, DateInput, overlay, Picker } from "../../components/picker";
import { dayLabel } from "../../lib/dates";
import type { Category } from "../../lib/schemas";
import type { Drafting } from "./use-drafting";

const field = "min-w-0 rounded-token bg-transparent px-1 -mx-1 outline-none focus:bg-surface2";
const chip =
  "press relative inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-chip bg-surface2 px-3 text-[13px] font-medium";

export function Review(props: {
  form: Drafting["form"];
  ready: boolean;
  categories: Category[];
  recent: string[];
  unit: Unit;
  image?: string;
  saving: boolean;
  onSave: () => void;
  onDismiss: () => void;
}) {
  const { register, watch, setValue, formState } = props.form;
  const f = watch();
  const category = props.categories.find((c) => c.id === f.categoryId);
  const shown = firstInvalid(formState.errors);
  const error = shown && formState.errors[shown]?.message;
  const id = useId();
  const invalid = (name: "note" | "amount") => ({
    "aria-invalid": formState.errors[name] ? true : undefined,
    "aria-describedby": shown === name ? id : undefined,
  });
  return (
    <section
      aria-live="polite"
      aria-label="Review expense"
      className="rise rounded-card bg-surface px-5 pt-[18px] pb-2.5 shadow-lift"
    >
      {!props.ready ? (
        <p className="text-[17px] leading-snug font-medium text-ink3">
          {props.image ? "Reading your receipt…" : "Reading your expense…"}
        </p>
      ) : (
        <>
          <div className="flex items-center gap-3">
            {props.image && <ReceiptPreview image={props.image} />}
            <Tile category={category} />
            <input
              aria-label="Note"
              className={`${field} flex-1 text-[17px] font-medium`}
              {...invalid("note")}
              {...register("note")}
            />
            <input
              aria-label="Amount"
              inputMode="decimal"
              placeholder="0.00"
              className={`${field} num w-24 text-right text-[17px] font-medium placeholder:text-up`}
              {...invalid("amount")}
              {...register("amount")}
            />
          </div>
          {error && (
            <p id={id} className="mt-1.5 text-xs text-up">
              {error}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Picker className={chip}>
              {category?.name ?? "Category"}
              <select aria-label="Category" className={overlay} {...register("categoryId", { valueAsNumber: true })}>
                <option value="0">Category</option>
                <CategoryOptions categories={props.categories} />
              </select>
            </Picker>
            <Picker className={chip}>
              {dayLabel(f.date)}
              <DateInput value={f.date} onChange={(date) => setValue("date", date)} />
            </Picker>
            <Picker className={chip}>
              <span className="num">{f.currency === "BTC" ? props.unit : f.currency}</span>
              <CurrencySelect recent={props.recent} className={overlay} {...register("currency")} />
            </Picker>
            <input
              aria-label="Tags"
              placeholder="#tags"
              className={`${chip} w-28 text-ink2 outline-none focus:ring-2 focus:ring-accent-soft`}
              {...register("tags")}
            />
          </div>
        </>
      )}
      <div className="mt-3 flex justify-end gap-1 border-t border-line pt-1.5">
        <Button onClick={props.onDismiss}>Dismiss</Button>
        <button
          type="button"
          disabled={!props.ready || props.saving}
          onClick={props.onSave}
          className="press hit rounded-chip bg-accent px-3 py-1.5 text-[13px] font-medium text-on-accent disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </section>
  );
}

function firstInvalid(errors: { note?: unknown; amount?: unknown }) {
  if (errors.note) return "note";
  return errors.amount ? "amount" : null;
}
