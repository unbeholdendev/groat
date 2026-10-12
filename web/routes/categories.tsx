import { type FormEvent, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { type Category, CategoryOptions, Icon, useCategories, useSend } from "../shared";

export const Route = createFileRoute("/categories")({ component: Categories });

type Tag = { id: number; name: string };

function Categories() {
  const categories = useCategories();
  const tags = useQuery<Tag[]>({ queryKey: ["/api/tags"] }).data ?? [];
  const [deleting, setDeleting] = useState<number | null>(null);
  const [moveTo, setMoveTo] = useState("");
  const [draft, setDraft] = useState({ name: "", icon: "📁", color: "#71717a", parentId: "" });
  const { mutate: call, error } = useSend();

  const update = (id: number, field: string, value: string) => call(["PUT", `/api/categories/${id}`, { [field]: value }]);

  function move(c: Category, by: number) {
    const ids = categories.filter((s) => s.parentId === c.parentId).map((s) => s.id);
    const i = ids.indexOf(c.id);
    if (i + by < 0 || i + by >= ids.length) return;
    [ids[i], ids[i + by]] = [ids[i + by], ids[i]];
    call(["PUT", "/api/categories/order", ids]);
  }

  function remove(id: number) {
    setDeleting(null);
    setMoveTo("");
    call(["DELETE", `/api/categories/${id}${moveTo ? `?moveTo=${moveTo}` : ""}`]);
  }

  function add(e: FormEvent) {
    e.preventDefault();
    call(["POST", "/api/categories", { ...draft, parentId: Number(draft.parentId) || null }]);
    setDraft({ ...draft, name: "" });
  }

  function renameTag(t: Tag) {
    const name = prompt("Rename tag", t.name);
    if (name) call(["PUT", `/api/tags/${t.id}`, { name }]);
  }

  function deleteTag(t: Tag) {
    if (confirm(`Delete #${t.name}? It will be removed from every expense.`))
      call(["DELETE", `/api/tags/${t.id}`]);
  }

  const tree = categories
    .filter((p) => p.parentId === null)
    .flatMap((p) => [p, ...categories.filter((c) => c.parentId === p.id)]);
  const small = "grid size-8 place-items-center rounded-md text-ink3";

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-[22px] font-semibold tracking-tight">Categories</h1>
      {error && <p className="text-sm text-up">{error.message}</p>}
      <ul>
        {tree.map((c) => (
          <li key={c.id} className={`flex flex-wrap items-center gap-1 border-b border-line py-1.5 last:border-0 ${c.parentId ? "pl-7" : ""}`}>
            <input
              aria-label="Emoji"
              className="input w-11 px-0 text-center"
              defaultValue={c.icon}
              onBlur={(e) => update(c.id, "icon", e.target.value)}
            />
            <input
              aria-label="Name"
              className="input min-w-0 flex-1 border-transparent bg-transparent font-medium"
              defaultValue={c.name}
              onBlur={(e) => update(c.id, "name", e.target.value)}
            />
            <input
              type="color"
              aria-label="Colour"
              className="size-6 cursor-pointer rounded-full [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
              defaultValue={c.color}
              onBlur={(e) => update(c.id, "color", e.target.value)}
            />
            <button className={small} onClick={() => move(c, -1)} aria-label="Move up">
              <Icon className="size-4 stroke-2">
                <path d="m6 15 6-6 6 6" />
              </Icon>
            </button>
            <button className={small} onClick={() => move(c, 1)} aria-label="Move down">
              <Icon className="size-4 stroke-2">
                <path d="m6 9 6 6 6-6" />
              </Icon>
            </button>
            {!c.builtin && (
              <button className={`${small} hover:text-up`} onClick={() => setDeleting(c.id)} aria-label="Delete">
                <Icon className="size-4 stroke-2">
                  <path d="M6 6l12 12M18 6 6 18" />
                </Icon>
              </button>
            )}
            {deleting === c.id && (
              <div className="flex w-full flex-wrap items-center gap-2 py-2 text-sm text-ink2">
                Move its expenses to
                <select className="input" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                  <option value="">Uncategorised</option>
                  <CategoryOptions categories={categories} except={c.id} />
                </select>
                <button className="font-medium text-up" onClick={() => remove(c.id)}>
                  Delete
                </button>
                <button onClick={() => setDeleting(null)}>Cancel</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="flex flex-wrap items-center gap-1.5">
        <input
          aria-label="Emoji"
          className="input w-11 px-0 text-center"
          value={draft.icon}
          onChange={(e) => setDraft({ ...draft, icon: e.target.value })}
        />
        <input
          className="input min-w-0 flex-1"
          placeholder="New category"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
        <input
          type="color"
          aria-label="Colour"
          className="size-6 cursor-pointer [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
          value={draft.color}
          onChange={(e) => setDraft({ ...draft, color: e.target.value })}
        />
        <select className="input min-w-0 flex-1" value={draft.parentId} onChange={(e) => setDraft({ ...draft, parentId: e.target.value })}>
          <option value="">Top level</option>
          {categories
            .filter((p) => p.parentId === null)
            .map((p) => (
              <option key={p.id} value={p.id}>
                In {p.name}
              </option>
            ))}
        </select>
        <button className="primary">Add</button>
      </form>
      <section>
        <h2 className="pb-2 text-[13px] font-medium text-ink2">Tags</h2>
        {tags.length === 0 && <p className="text-sm text-ink3">No tags yet. Add one to an expense with #name.</p>}
        <ul className="flex flex-wrap gap-1.5 text-sm">
          {tags.map((t) => (
            <li key={t.id} className="flex items-center rounded-[7px] border border-line2 bg-surface">
              <button className="py-1 pr-1 pl-2.5" onClick={() => renameTag(t)}>
                #{t.name}
              </button>
              <button className="grid size-7 place-items-center text-ink3 hover:text-up" onClick={() => deleteTag(t)} aria-label={`Delete #${t.name}`}>
                <Icon className="size-3.5 stroke-2">
                  <path d="M6 6l12 12M18 6 6 18" />
                </Icon>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
