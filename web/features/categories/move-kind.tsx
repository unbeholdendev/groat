import { z } from "zod";
import type { Kind } from "../../../shared/schema";
import { Button } from "../../components/button";
import { useApi } from "../../lib/api";
import { type Category, transaction } from "../../lib/schemas";

export function MoveKind(props: { category: Category; kind: Kind; categories: Category[]; onKeep: () => void; onMove: () => void }) {
  const { category: c, kind } = props;
  const affected = useApi(z.array(transaction), ["/api/transactions?", `category=${c.id}`]).data;
  const to = kind === "income" ? "Income" : "Expenses";
  return (
    <div className="flex flex-col gap-2 text-sm text-ink2">
      <p>
        {affected ? `${affected.length} ${affected.length === 1 ? "entry" : "entries"}` : "Its entries"}
        {props.categories.some((s) => s.parentId === c.id) && " (subcategories included)"} will move to {to}.
      </p>
      <div className="flex justify-end">
        <Button className="h-11" onClick={props.onKeep}>
          Keep
        </Button>
        <Button variant="primary" onClick={props.onMove}>
          Move to {to}
        </Button>
      </div>
    </div>
  );
}
