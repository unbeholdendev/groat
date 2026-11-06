import { useContext } from "react";
import { Tile } from "../../components/category";
import { Icon, paths } from "../../components/icon";
import { useCategories, useSession, useSettings } from "../../lib/api";
import { dayLabel } from "../../lib/dates";
import { money } from "../../lib/money";
import type { Transaction } from "../../lib/schemas";
import { UnitContext } from "../../lib/unit";
import { useTemplates } from "./queries";
import { useEdit } from "./use-month";

export const rowClass = "press relative flex h-[62px] items-center gap-3 px-4";

export function TransactionRow({ transaction: e, dated }: { transaction: Transaction; dated?: boolean }) {
  const settings = useSettings()!;
  const [unit] = useContext(UnitContext);
  const category = useCategories().find((c) => c.id === e.categoryId);
  const templates = useTemplates();
  const me = useSession()?.user?.username;
  const edit = useEdit();
  const show = (amount: number, c: string) => money(amount, c, unit);
  const Note = dated || e.id < 0 ? "span" : "button";
  const foreign = e.currency !== settings.baseCurrency && e.baseAmount !== undefined;
  return (
    <>
      <Tile category={category} />
      <span className="min-w-0 flex-1">
        <Note
          onClick={Note === "button" ? () => edit(e) : undefined}
          className={`block w-full truncate text-left font-medium ${Note === "button" ? "outline-none after:absolute after:inset-0 after:-outline-offset-2 focus-visible:after:outline-2 focus-visible:after:outline-accent" : ""}`}
        >
          {e.note}
          {e.recurringId && (
            <span title={`Recurring: ${templates.find((t) => t.id === e.recurringId)?.note ?? "deleted"}`}>
              <Icon d={paths.repeat} className="ml-1.5 inline size-3.5 stroke-2 align-[-2px] text-ink3" />
            </span>
          )}
        </Note>
        <span className="mt-0.5 block truncate text-xs font-medium text-ink3">
          {[dated && `${dayLabel(e.date)} ·`, category?.name, ...e.tags.map((t) => `#${t}`), e.addedBy && e.addedBy !== me && `by ${e.addedBy}`].filter(Boolean).join("  ")}
        </span>
      </span>
      <span className="num text-right text-[15px] font-medium whitespace-nowrap">
        {foreign && e.baseAmount != null ? show(e.baseAmount, settings.baseCurrency) : show(e.amount, e.currency)}
        {e.id < 0 && <span className="block font-sans text-xs text-ink3">Will sync</span>}
        {foreign && (
          <span className="block text-xs text-ink3">
            {e.baseAmount === null ? <span className="font-sans text-amber">Unconverted</span> : show(e.amount, e.currency)}
          </span>
        )}
      </span>
    </>
  );
}
