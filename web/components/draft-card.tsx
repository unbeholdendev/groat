import type { Unit } from "../../shared/amount";
import { dayLabel } from "../lib/dates";
import { money } from "../lib/money";
import type { Draft } from "../lib/schemas";

export const DraftCard = ({
  draft,
  unit,
  className,
  onClick,
}: {
  draft: Draft;
  unit: Unit;
  className: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`press flex justify-between gap-3 rounded-field px-3.5 py-2.5 text-left ${className}`}
  >
    <span>
      Review draft: <b className="font-medium">{draft.note}</b>, {dayLabel(draft.date)}
    </span>
    <span className="num whitespace-nowrap">{money(draft.amount, draft.currency, unit)}</span>
  </button>
);
