import { type PointerEvent, useContext, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { Chevron, Icon, paths } from "../../components/icon";
import { Total } from "../../components/total";
import { useSettings } from "../../lib/api";
import { today } from "../../lib/dates";
import type { Transaction } from "../../lib/schemas";
import { UnitContext } from "../../lib/unit";
import { inBase, useKindOf } from "./queries";
import { Summary } from "./summary";
import { route, useMonth } from "./use-month";

const stepper = "press hit grid size-9 shrink-0 place-items-center rounded-chip hover:bg-surface2";

export function MonthHeader({
  rows,
  showFilters,
  onFilters,
}: {
  rows: Transaction[];
  showFilters: boolean;
  onFilters: () => void;
}) {
  const { month, filter, filtered, end, step, label, kind } = useMonth();
  const kindOf = useKindOf();
  const counted = rows.filter((e) => kindOf(e) === (kind ?? "expense"));
  const shown = kind ? counted : rows;
  const { baseCurrency: base } = useSettings()!;
  const [unit] = useContext(UnitContext);
  const navigate = route.useNavigate();
  const swipeFrom = useRef<[number, number]>(undefined);
  const count = Object.values(filter).filter(Boolean).length;
  const unrated = counted.filter((e) => e.baseAmount === null).length;
  const go = (n: number) =>
    navigate({
      search: { month: step(n) === today().slice(0, 7) ? undefined : step(n), kind },
      viewTransition: { types: [n < 0 ? "back" : "forward"] },
    });
  const swipe = (e: PointerEvent<HTMLElement>) => {
    const [x, y] = swipeFrom.current ?? [e.clientX, e.clientY];
    const dx = e.clientX - x;
    swipeFrom.current = undefined;
    if (filtered || Math.abs(dx) < 60 || Math.abs(dx) < 2 * Math.abs(e.clientY - y)) return;
    if (dx > 0) go(-1);
    else if (month) go(1);
  };

  return (
    <header
      onPointerDown={(e) => {
        if (e.isPrimary) swipeFrom.current = [e.clientX, e.clientY];
      }}
      onPointerUp={(e) => e.isPrimary && swipe(e)}
      onPointerCancel={() => {
        swipeFrom.current = undefined;
      }}
      className="touch-pan-y"
    >
      <div className="flex items-center gap-1 text-ink2">
        {!filtered && (
          <button aria-label="Previous month" className={stepper} onClick={() => go(-1)}>
            <Chevron className="size-[18px] rotate-90 stroke-2" />
          </button>
        )}
        <h1 className="min-w-0 text-[15px] font-semibold">{filtered ? "Filtered" : label}</h1>
        {!filtered && (
          <button
            aria-label="Next month"
            disabled={!month}
            className={`${stepper} disabled:opacity-30`}
            onClick={() => go(1)}
          >
            <Chevron className="size-[18px] -rotate-90 stroke-2" />
          </button>
        )}
        <button
          aria-label={count ? `Filters, ${count} on` : "Filters"}
          aria-expanded={showFilters}
          onClick={onFilters}
          className={`${stepper} relative ml-auto aria-expanded:bg-ink aria-expanded:text-bg`}
        >
          <Icon d="M4 7h16M7 12h10M10 17h4" className="size-[18px] stroke-2" />
          {count > 0 && (
            <b className="num absolute -top-1 -right-1 grid size-[18px] place-items-center rounded-chip bg-accent text-[11px] font-semibold text-on-accent ring-2 ring-bg">
              {count}
            </b>
          )}
        </button>
        <Link to="/chat" aria-label="Chats" title="Chats" className={`${stepper} lg:hidden`}>
          <Icon d={paths.chat} className="size-[18px] stroke-2" />
        </Link>
      </div>
      {filtered ? (
        <>
          <p className="mt-4">
            <Total amount={inBase(counted, base)} currency={base} unit={unit} />
          </p>
          <p className="mt-2.5 text-[13px] font-medium text-ink2">
            {shown.length} matching{unrated > 0 && ` + ${unrated} without rates · incomplete`}
          </p>
        </>
      ) : (
        <Summary
          unit={unit}
          end={month ? end : undefined}
          rows={rows.filter((e) => kindOf(e) === "expense")}
          month={step(0)}
        />
      )}
    </header>
  );
}
