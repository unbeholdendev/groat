import { Tile } from "../../../components/category";
import { Chevron } from "../../../components/icon";
import { DateInput, Picker } from "../../../components/picker";
import { useCategories } from "../../../lib/api";
import { dayLabel, today } from "../../../lib/dates";
import { iso } from "../../../lib/period";
import type { Kind } from "../../../../shared/schema";
import type { Category } from "../../../lib/schemas";

export const choice = (on: boolean) =>
  `press relative inline-flex h-8 shrink-0 items-center gap-1.5 rounded-chip border text-[13px] font-medium transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent ${on ? "border-accent bg-accent-soft text-ink" : "border-line2 bg-surface text-ink2"}`;

export function CategoryChips({ kind, value, onChange }: { kind: Kind; value: number | null; onChange: (id: number | null) => void }) {
  const categories = useCategories();
  const picked = categories.find((c) => c.id === value);
  const branch = picked?.parentId ?? picked?.id;
  const kids = categories.filter((c) => c.parentId !== null && c.parentId === branch);
  const tops = categories.filter((c) => c.parentId === null && !c.builtin && c.kind === kind);
  const parents = new Set(categories.map((c) => c.parentId));
  const toggle = (c: Category) => onChange(value === c.id ? null : c.id);
  const cells = tops.map((c) => (
    <button
      type="button"
      key={c.id}
      aria-pressed={value === c.id}
      aria-expanded={parents.has(c.id) ? c.id === branch : undefined}
      onClick={() => toggle(c)}
      className={`press flex min-w-0 flex-col items-center gap-1 rounded-tile py-1 text-[11px] font-medium ${c.id === branch ? "text-ink" : "text-ink2"}`}
    >
      <span className={`rounded-[calc(var(--radius-tile)+3px)] p-[3px] outline-2 ${value === c.id ? "outline-accent" : "outline-transparent"}`}>
        <Tile category={c} />
      </span>
      <span className="flex w-full items-center justify-center gap-0.5">
        <span className="truncate">{c.name}</span>
        {parents.has(c.id) && <Chevron className={`size-2.5 shrink-0 stroke-[2.5] text-ink3 transition-transform ${c.id === branch ? "rotate-180" : ""}`} />}
      </span>
    </button>
  ));
  if (kids.length)
    cells.splice(
      Math.min(tops.length, (Math.floor(tops.findIndex((c) => c.id === branch) / 4) + 1) * 4),
      0,
      <div key={`sub${branch}`} role="group" aria-label="Subcategory" className="rise col-span-4 flex flex-wrap gap-1.5 rounded-field bg-surface2 p-2">
        {kids.map((c) => (
          <button type="button" key={c.id} aria-pressed={value === c.id} onClick={() => toggle(c)} className={`${choice(value === c.id)} pr-3 pl-px`}>
            <Tile category={c} small />
            {c.name}
          </button>
        ))}
      </div>,
    );
  return (
    <div role="group" aria-label="Category" className="mt-5 grid grid-cols-4 gap-x-1 gap-y-2">
      {cells}
    </div>
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
