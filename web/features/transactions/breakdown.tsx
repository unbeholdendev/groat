import { ShareBar } from "../../components/share-bar";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import type { Unit } from "../../../shared/amount";
import { Tile } from "../../components/category";
import { Segmented } from "../../components/segmented";
import { divide, panel } from "../../components/styles";
import { useCategories } from "../../lib/api";
import { money } from "../../lib/money";
import { span, usePeriod } from "../../lib/period";

export function Breakdown({ unit, end }: { unit: Unit; end?: Date }) {
  const s = span("This month", undefined, end);
  const now = usePeriod(s.range);
  const [show, setShow] = useState<"Amount" | "Share">("Amount");
  const categories = useCategories();
  if (!now?.total) return null;
  return (
    <aside className="fixed top-6 left-[calc(50%+248px)] hidden max-h-[calc(100dvh-48px)] w-72 overflow-y-auto xl:block">
      <div className="flex items-center justify-between gap-3 px-1 pb-3">
        <h2 className="legend text-[13px] font-semibold text-ink2">By category</h2>
        <div className="w-36">
          <Segmented label="Show" options={["Amount", "Share"]} value={show} onChange={setShow} />
        </div>
      </div>
      <ul className={panel}>
        {now.categories.map((c, i) => {
          const known = categories.find((k) => k.id === c.id);
          return (
            <li key={c.id} className={divide}>
              <Link
                to="/"
                search={{ category: String(c.id), from: s.range[0], to: s.range[1] }}
                className="press flex items-center gap-3 px-4 py-3 hover:bg-surface2"
              >
                <Tile category={known ?? c} small />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2 text-[13px]">
                    <span className="truncate font-medium">{c.name}</span>
                    <span className="num ml-auto">
                      {show === "Amount"
                        ? money(c.total, now.baseCurrency, unit)
                        : `${Math.round((c.total / now.total) * 100)}%`}
                    </span>
                  </span>
                  <ShareBar
                    className="mt-1.5 block h-1"
                    share={c.total / now.total}
                    color={c.color}
                    builtin={known?.builtin}
                    index={i}
                  />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <Link to="/stats" className="mt-3 block px-1 text-[13px] font-medium text-accent">
        All stats
      </Link>
    </aside>
  );
}
