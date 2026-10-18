import { useContext } from "react";
import { Tile } from "../../components/category";
import { FormError } from "../../components/form";
import { divide } from "../../components/styles";
import { useCategories, useSend } from "../../lib/api";
import { dayLabel } from "../../lib/dates";
import { money } from "../../lib/money";
import { UnitContext } from "../../lib/unit";
import { usePending } from "./queries";
import { useEdit } from "./use-month";

export function PendingList() {
  const pending = usePending();
  const categories = useCategories();
  const [unit] = useContext(UnitContext);
  const edit = useEdit();
  const mutation = useSend("expense");
  if (!pending.length) return null;
  return (
    <>
      <FormError error={mutation.error} className="mt-5" />
      <ul className="mt-5 overflow-hidden rounded-panel bg-amber-soft">
        {pending.map((e) => (
          <li key={e.id} className={`relative flex h-[62px] items-center gap-3 px-4 ${divide} not-last:after:bg-amber-line!`}>
            <Tile category={categories.find((c) => c.id === e.categoryId)} />
            <button className="press min-w-0 flex-1 text-left" onClick={() => edit(e)}>
              <span className="block truncate font-medium">{e.note}</span>
              <span className="mt-0.5 block truncate text-xs font-medium text-amber">
                <span className="num">{money(e.amount, e.currency, unit)}</span> · due {dayLabel(e.date).replace(/^(Today|Yesterday)$/, (w) => w.toLowerCase())}
              </span>
            </button>
            <button
              className="press hit rounded-chip border border-amber-line bg-surface px-3 py-1.5 text-[13px] font-semibold text-amber"
              onClick={() => mutation.mutate(["POST", `/api/expenses/${e.id}/confirm`])}
            >
              Confirm
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
