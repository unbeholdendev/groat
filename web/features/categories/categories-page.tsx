import { useState } from "react";
import { useCategories } from "../../lib/api";
import { CategoryList } from "./category-list";
import { text } from "./styles";
import { Tags } from "./tags";

export function CategoriesPage() {
  const categories = useCategories();
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [reorder, setReorder] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-display font-bold">Categories</h1>
        <button className={`${text} -mr-2.5 text-ink2`} onClick={() => (setReorder(!reorder), setEditing(null))}>
          {reorder ? "Done" : "Reorder"}
        </button>
      </div>
      <CategoryList categories={categories} editing={editing} onEdit={setEditing} reorder={reorder} />
      <Tags />
    </div>
  );
}
