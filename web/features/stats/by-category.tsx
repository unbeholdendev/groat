import type { Category } from "../../lib/schemas";
import { CategoryRow } from "./category-row";
import { Head } from "./head";
import type { Period } from "./types";

export function ByCategory(props: {
  now: Period;
  prev: Period;
  categories: Category[];
  range: [string, string];
  vs: string;
  show: (n: number) => string;
  open: number | null;
  onOpen: (id: number | null) => void;
}) {
  const { now, prev, vs } = props;
  const tile = (id: number) => props.categories.find((c) => c.id === id);
  const fresh = prev.total ? now.categories.filter((c) => !prev.categories.find((r) => r.id === c.id)?.total && !tile(c.id)?.builtin) : [];
  return (
    <>
      <Head title="By category" vs={vs} />
      <ul className="overflow-hidden rounded-panel bg-surface shadow-panel">
        {now.categories.length === 0 && <li className="px-4 py-6 text-ink3">No spending in this period.</li>}
        {now.categories.map((c, i) => (
          <CategoryRow
            key={c.id}
            slice={c}
            index={i}
            total={now.total}
            before={prev.categories.find((p) => p.id === c.id)}
            pad={prev.total > 0}
            tile={tile}
            range={props.range}
            show={props.show}
            open={props.open === c.id}
            onToggle={() => props.onOpen(props.open === c.id ? null : c.id)}
          />
        ))}
      </ul>
      {fresh.length > 0 && (
        <p className="mt-2.5 px-1 text-[12px] font-medium text-ink3">
          New since {vs}: {fresh.map((c) => `${c.icon} ${c.name}`).join(", ")}
        </p>
      )}
    </>
  );
}
