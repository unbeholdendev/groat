import { choice } from "./form/chips";
import { useMonth } from "./use-month";

const options = [
  [undefined, "All"],
  ["expense", "Expenses"],
  ["income", "Income"],
] as const;

export function KindFilter() {
  const { kind, setKind } = useMonth();
  return (
    <div role="group" aria-label="Show" className="mt-5 flex gap-1.5">
      {options.map(([k, name]) => (
        <button type="button" key={name} aria-pressed={kind === k} onClick={() => setKind(k)} className={`${choice(kind === k)} px-3.5`}>
          {name}
        </button>
      ))}
    </div>
  );
}
