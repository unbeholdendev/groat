import { Tile } from "../../../components/category";
import { Chevron } from "../../../components/icon";
import { DateInput, Picker } from "../../../components/picker";
import { useCategories } from "../../../lib/api";
import { dayLabel, today } from "../../../lib/dates";
import { iso } from "../../../lib/period";
import type { Category } from "../../../lib/schemas";

const choice = (on: boolean) =>
  `press relative inline-flex h-8 shrink-0 items-center gap-1.5 rounded-chip border text-[13px] font-medium transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent ${on ? "border-accent bg-accent-soft text-ink" : "border-line2 bg-surface text-ink2"}`;

export function CategoryChips({ value, onChange }: { value: number | null; onChange: (id: number | null) => void }) {
  const categories = useCategories();
  const picked = categories.find((c) => c.id === value);
  const branch = picked?.parentId ?? picked?.id;
  const kids = categories.filter((c) => c.parentId !== null && c.parentId === branch);
  const chip = (c: Category) => (
    <button type="button" key={c.id} aria-pressed={value === c.id} onClick={() => onChange(value === c.id ? null : c.id)} className={`${choice(c.id === value || c.id === branch)} pr-3 pl-px`}>
      <Tile category={c} small />
      {c.name}
    </button>
  );
  return (
    <>
      <div role="group" aria-label="Category" className="mt-5 flex flex-wrap gap-1.5">
        {categories.filter((c) => c.parentId === null && !c.builtin).map(chip)}
      </div>
      {kids.length > 0 && (
        <div key={branch} role="group" aria-label="Subcategory" className="rise mt-2 flex flex-wrap gap-1.5">
          {kids.map(chip)}
        </div>
      )}
    </>
  );
}

export function DateChips({ value, onChange }: { value: string; onChange: (date: string) => void }) {
  const yesterday = iso(new Date(Date.now() - 864e5));
  const other = value !== today() && value !== yesterday;
  return (
    <div role="group" aria-label="Date" className="mt-5 flex flex-wrap gap-1.5">
      {[
        [today(), "Today"],
        [yesterday, "Yesterday"],
      ].map(([d, name]) => (
        <button type="button" key={d} aria-pressed={value === d} onClick={() => onChange(d)} className={`${choice(value === d)} px-3.5`}>
          {name}
        </button>
      ))}
      <Picker className={`${choice(other)} px-3.5`} chevron={<Chevron className="size-3.5 stroke-2" />}>
        {other ? dayLabel(value) : "Another day"}
        <DateInput value={value} onChange={onChange} />
      </Picker>
    </div>
  );
}
