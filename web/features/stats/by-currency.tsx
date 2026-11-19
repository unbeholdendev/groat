import { useContext } from "react";
import { divide } from "../../components/styles";
import { money } from "../../lib/money";
import { UnitContext } from "../../lib/unit";
import { Head } from "./head";
import type { Period } from "./types";

export function ByCurrency({ now, show }: { now: Period; show: (n: number) => string }) {
  const [unit] = useContext(UnitContext);
  if (now.currencies.every((c) => c.currency === now.baseCurrency)) return null;
  return (
    <>
      <Head title="By currency" vs={null} />
      <ul className="overflow-hidden rounded-panel bg-surface shadow-panel">
        {now.currencies.map((c) => (
          <li key={c.currency} className={`${divide} flex h-[52px] items-center gap-3 px-4`}>
            <span className="w-12 shrink-0 font-medium">{c.currency}</span>
            <span className="num min-w-0 flex-1 truncate">{money(c.amount, c.currency, unit)}</span>
            {c.currency !== now.baseCurrency &&
              (c.base === null ? (
                <span className="text-[13px] text-amber">No rate</span>
              ) : (
                <span className="num text-ink2">{show(c.base)}</span>
              ))}
          </li>
        ))}
      </ul>
    </>
  );
}
