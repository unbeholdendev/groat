import type { ReactNode } from "react";
import { formatAmount, type Unit } from "../shared/amount";
import type { Category, Draft } from "./api";
import { CategoryOptions, Tile } from "./category";
import { dayLabel, today } from "./dates";
import { Chevron } from "./ui";

export type Fields = { note: string; amount: string; currency: string; date: string; categoryId: number; tags: string };

export const fields = (d: Draft, unit: Unit): Fields => ({
  note: d.note,
  amount: d.amount ? formatAmount(d.amount, d.currency, unit) : "",
  currency: d.currency,
  date: d.date,
  categoryId: d.categoryId ?? 0,
  tags: d.tags.map((t) => `#${t}`).join(" "),
});

export const payload = (f: Fields, unit: Unit) => ({
  note: f.note,
  amount: f.amount,
  currency: f.currency,
  unit,
  date: f.date,
  categoryId: f.categoryId,
  tags: f.tags.split(/\s+/).map((t) => t.replace(/^#/, "")).filter(Boolean),
});

const field = "min-w-0 rounded-token bg-transparent px-1 -mx-1 outline-none focus:bg-surface2";
const chip = "press relative inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-chip bg-surface2 px-3 text-[13px] font-medium";

function Picker({ children, control }: { children: ReactNode; control: ReactNode }) {
  return (
    <label className={chip}>
      {children}
      <Chevron />
      {control}
    </label>
  );
}

export function Review(props: {
  value: Fields | null;
  onChange: (f: Fields) => void;
  categories: Category[];
  currencies: string[];
  unit: Unit;
  image?: string;
  saving: boolean;
  onSave: () => void;
  onDismiss: () => void;
}) {
  const f = props.value;
  const category = f ? props.categories.find((c) => c.id === f.categoryId) : undefined;
  const set = (patch: Partial<Fields>) => f && props.onChange({ ...f, ...patch });
  const overlay = "absolute inset-0 opacity-0";
  return (
    <section aria-live="polite" aria-label="Review expense" className="rise rounded-card bg-surface px-5 pt-[18px] pb-2.5 shadow-lift">
      {!f ? (
        <p className="text-[17px] leading-snug font-medium text-ink3">{props.image ? "Reading your receipt…" : "Reading your expense…"}</p>
      ) : (
        <>
          <div className="flex items-center gap-3">
            {props.image && <img src={props.image} alt="Receipt" className="size-10 shrink-0 rounded-token object-cover" />}
            <Tile category={category} />
            <input aria-label="Note" className={`${field} flex-1 text-[17px] font-medium`} value={f.note} onChange={(e) => set({ note: e.target.value })} />
            <input
              aria-label="Amount"
              inputMode="decimal"
              placeholder="0.00"
              className={`${field} num w-24 text-right text-[17px] font-medium placeholder:text-up`}
              value={f.amount}
              onChange={(e) => set({ amount: e.target.value })}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Picker
              control={
                <select aria-label="Category" className={overlay} value={f.categoryId} onChange={(e) => set({ categoryId: Number(e.target.value) })}>
                  <CategoryOptions categories={props.categories} />
                </select>
              }
            >
              {category?.name ?? "Category"}
            </Picker>
            <Picker
              control={
                <input
                  aria-label="Date"
                  type="date"
                  className={overlay}
                  max={today()}
                  value={f.date}
                  onClick={(e) => e.currentTarget.showPicker?.()}
                  onChange={(e) => set({ date: e.target.value || today() })}
                />
              }
            >
              {dayLabel(f.date)}
            </Picker>
            <Picker
              control={
                <select aria-label="Currency" className={overlay} value={f.currency} onChange={(e) => set({ currency: e.target.value })}>
                  {props.currencies.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              }
            >
              <span className="num">{f.currency === "BTC" ? props.unit : f.currency}</span>
            </Picker>
            <input aria-label="Tags" placeholder="#tags" className={`${chip} w-28 text-ink2 outline-none focus:ring-2 focus:ring-accent-soft`} value={f.tags} onChange={(e) => set({ tags: e.target.value })} />
          </div>
        </>
      )}
      <div className="mt-3 flex justify-end gap-1 border-t border-line pt-1.5">
        <button type="button" onClick={props.onDismiss} className="press hit rounded-chip px-2.5 py-1.5 text-[13px] font-medium text-ink2">
          Dismiss
        </button>
        <button type="button" disabled={!f || props.saving} onClick={props.onSave} className="press hit rounded-chip bg-accent px-3 py-1.5 text-[13px] font-medium text-on-accent disabled:opacity-50">
          Save
        </button>
      </div>
    </section>
  );
}
