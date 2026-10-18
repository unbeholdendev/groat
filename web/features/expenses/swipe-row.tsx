import { useRef, useState } from "react";
import { Icon, paths } from "../../components/icon";
import { FormError } from "../../components/form";
import { divide } from "../../components/styles";
import { useSend } from "../../lib/api";
import type { Expense } from "../../lib/schemas";
import { ExpenseRow, rowClass } from "./expense-row";

export function SwipeRow({ expense: e, fresh, onSetRate }: { expense: Expense; fresh: boolean; onSetRate: () => void }) {
  const [swiped, setSwiped] = useState<{ x: number; dx: number } | null>(null);
  const dragged = useRef(false);
  const mutation = useSend("expense");
  const sliding = !!swiped && swiped.dx < -8;
  return (
    <li
      className={`relative ${sliding ? "bg-up" : "hover:bg-surface2"} ${divide} ${fresh ? "grow-in" : ""}`}
      onClickCapture={(ev) => dragged.current && (ev.stopPropagation(), (dragged.current = false))}
    >
      {sliding && <Icon d={paths.bin} className="absolute top-1/2 right-6 size-5 -translate-y-1/2 stroke-2 text-surface" />}
      <div
        className={`${rowClass} touch-pan-y ${sliding ? "bg-surface" : "transition-transform"}`}
        style={{ translate: swiped ? `${swiped.dx}px` : undefined }}
        onPointerDown={(p) => p.isPrimary && p.pointerType !== "mouse" && e.id > 0 && setSwiped({ x: p.clientX, dx: 0 })}
        onPointerMove={(p) => swiped && setSwiped({ ...swiped, dx: Math.min(0, p.clientX - swiped.x) })}
        onPointerUp={() => {
          if (!swiped) return;
          dragged.current = swiped.dx < -8;
          if (swiped.dx < -96) mutation.mutate(["DELETE", `/api/expenses/${e.id}`]);
          setSwiped(null);
        }}
        onPointerCancel={() => setSwiped(null)}
      >
        <ExpenseRow expense={e} onSetRate={onSetRate} />
      </div>
      <FormError error={mutation.error} className="px-4 pb-2" />
    </li>
  );
}
