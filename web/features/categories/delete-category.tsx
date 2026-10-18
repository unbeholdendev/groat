import { useState } from "react";
import { z } from "zod";
import { CategoryOptions } from "../../components/category";
import { Select } from "../../components/form";
import { useApi } from "../../lib/api";
import { type Category, expense } from "../../lib/schemas";
import { Button } from "../../components/button";

export function DeleteCategory(props: { category: Category; categories: Category[]; onKeep: () => void; onDelete: (moveTo: string) => void }) {
  const { category: c, categories } = props;
  const [moveTo, setMoveTo] = useState("");
  const affected = useApi(z.array(expense), ["/api/expenses?", `category=${c.id}`]).data;
  return (
    <div className="flex flex-col gap-2 text-sm text-ink2">
      <label className="label">
        {affected ? `${affected.length} ${affected.length === 1 ? "expense" : "expenses"}` : "Its expenses"}
        {c.parentId === null && categories.some((s) => s.parentId === c.id) && " (subcategories included)"} will move to
        <Select value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
          <option value="">Uncategorised</option>
          <CategoryOptions categories={categories} except={c.id} />
        </Select>
      </label>
      <div className="flex justify-end">
        <Button className="h-11" onClick={props.onKeep}>
          Keep
        </Button>
        <Button tone="up" className="h-11" onClick={() => props.onDelete(moveTo)}>
          Delete {c.name}
        </Button>
      </div>
    </div>
  );
}
