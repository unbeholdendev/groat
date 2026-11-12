import { useState } from "react";
import { kinds, type Kind } from "../../../shared/schema";
import { sectionHead } from "../../components/styles";
import { useCategories } from "../../lib/api";
import { CategoryList } from "./category-list";
import { Button } from "../../components/button";
import { Tags } from "./tags";

export function CategoriesPage() {
  const categories = useCategories();
  const [editing, setEditing] = useState<number | Kind | null>(null);
  const [reorder, setReorder] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-display font-bold">Categories</h1>
        <Button
          className="-mr-2.5 h-11"
          onClick={() => {
            setReorder(!reorder);
            setEditing(null);
          }}
        >
          {reorder ? "Done" : "Reorder"}
        </Button>
      </div>
      {kinds.map((kind) => (
        <section key={kind}>
          <h2 className={`${sectionHead} mt-0!`}>{kind === "income" ? "Income" : "Expenses"}</h2>
          <CategoryList kind={kind} categories={categories} editing={editing} onEdit={setEditing} reorder={reorder} />
        </section>
      ))}
      <Tags />
    </div>
  );
}
