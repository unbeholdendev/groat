import { Tile } from "../../components/category";
import { FormError } from "../../components/form";
import { Icon, paths } from "../../components/icon";
import { divide } from "../../components/styles";
import { useSend } from "../../lib/api";
import type { Kind } from "../../../shared/schema";
import type { Category } from "../../lib/schemas";
import { CategoryEditor } from "./category-editor";
import { Button } from "../../components/button";

export function CategoryList(props: { kind: Kind; categories: Category[]; editing: number | Kind | null; onEdit: (id: number | Kind | null) => void; reorder: boolean }) {
  const { kind, categories, editing, onEdit, reorder } = props;
  const { mutate: call, error, reset } = useSend("category");
  const tree = categories.filter((p) => p.parentId === null && p.kind === kind).flatMap((p) => [p, ...categories.filter((c) => c.parentId === p.id)]);
  const edit = (id: number | Kind) => (reset(), onEdit(id));

  function move(c: Category, by: number) {
    const siblings = categories.filter((s) => s.parentId === c.parentId && s.kind === kind);
    const other = siblings[siblings.indexOf(c) + by];
    if (!other) return;
    call(["PUT", "/api/categories/order", siblings.map((s) => (s === c ? other.id : s === other ? c.id : s.id))]);
  }

  const editor = (c?: Category) => (
    <CategoryEditor
      category={c}
      kind={kind}
      categories={categories}
      onClose={() => onEdit(null)}
      onDelete={(moveTo) => (onEdit(null), c && call(["DELETE", `/api/categories/${c.id}${moveTo ? `?moveTo=${moveTo}` : ""}`]))}
    />
  );

  return (
    <>
      <FormError error={error} />
      <div>
        <ul className="overflow-hidden rounded-panel bg-surface shadow-panel">
          {tree.map((c) =>
            editing === c.id ? (
              <li key={c.id} className={divide}>
                {editor(c)}
              </li>
            ) : (
              <li key={c.id} className={`${divide} flex items-center`}>
                <button
                  disabled={reorder}
                  className={`press flex min-w-0 flex-1 items-center gap-3 pr-4 text-left enabled:hover:bg-surface2 ${c.parentId ? "h-12 pl-16" : "h-[62px] pl-4 font-medium"}`}
                  onClick={() => edit(c.id)}
                >
                  <Tile category={c} small={!!c.parentId} />
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                </button>
                {reorder &&
                  [-1, 1].map((by) => (
                    <button key={by} className="grid size-11 place-items-center text-ink3" onClick={() => move(c, by)} aria-label={by < 0 ? "Move up" : "Move down"}>
                      <Icon d={paths.chevron} className={`size-4 stroke-2 ${by < 0 ? "rotate-180" : ""}`} />
                    </button>
                  ))}
              </li>
            ),
          )}
          {editing === kind && <li>{editor()}</li>}
        </ul>
        {editing !== kind && !reorder && (
          <Button className="mt-2 ml-1.5 flex h-11 items-center gap-1.5" onClick={() => edit(kind)}>
            <Icon d={paths.plus} className="size-4 stroke-2" />
            New {kind} category
          </Button>
        )}
      </div>
    </>
  );
}
