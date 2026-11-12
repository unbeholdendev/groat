import type { Unit } from "../../../shared/amount";
import { money } from "../../lib/money";
import type { Suggestion } from "../../lib/schemas";
import { pill } from "./tokens";

export const PastEntries = ({
  fills,
  unit,
  onFill,
}: {
  fills: Suggestion[];
  unit: Unit;
  onFill: (s: Suggestion) => void;
}) => (
  <div role="group" className="rise flex gap-1.5" aria-label="Past entries">
    {fills.map((s) => (
      <button
        key={s.note}
        type="button"
        className={`${pill} press hit min-w-0 shrink`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onFill(s)}
      >
        <span className="truncate">{s.note}</span>
        <span className="num text-ink3">{money(s.amount, s.currency, unit)}</span>
      </button>
    ))}
  </div>
);
