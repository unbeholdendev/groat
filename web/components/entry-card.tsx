import type { Unit } from "../../shared/amount";
import { dayLabel } from "../../shared/dates";
import { money } from "../lib/money";
import type { Draft } from "../lib/schemas";

export const EntryCard = ({
  label,
  entry,
  unit,
  className,
  onClick,
}: {
  label: string;
  entry: Draft;
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
      {label}: <b className="font-medium">{entry.note}</b>, {dayLabel(entry.date)}
    </span>
    <span className="num whitespace-nowrap">{money(entry.amount, entry.currency, unit)}</span>
  </button>
);
