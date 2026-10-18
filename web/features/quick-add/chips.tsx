import { CategoryOptions, Tile } from "../../components/category";
import { DateInput, Picker } from "../../components/picker";
import { dayLabel } from "../../lib/dates";
import type { Category } from "../../lib/schemas";
import { pill } from "./tokens";

const overlay = "absolute inset-x-0 -inset-y-1.5 opacity-0";

export const Chips = (props: { categories: Category[]; category?: Category; onCategory: (id: number | null) => void; date: string; onDate: (d: string) => void; currency: string }) => (
  <div className="rise flex gap-1.5">
    <Picker className={`${pill} press ${props.category ? "pl-1" : ""}`}>
      {props.category && <Tile category={props.category} small />}
      {props.category ? props.category.name : "Category"}
      <select aria-label="Category" className={overlay} value={props.category?.id ?? ""} onChange={(e) => props.onCategory(Number(e.target.value) || null)}>
        <option value="">Category</option>
        <CategoryOptions categories={props.categories} />
      </select>
    </Picker>
    <Picker className={`${pill} press`}>
      {dayLabel(props.date)}
      <DateInput className={overlay} value={props.date} onChange={props.onDate} />
    </Picker>
    <span className={`${pill} num text-ink2`}>{props.currency}</span>
  </div>
);
