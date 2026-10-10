import { type FormEvent, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { button, type Category, CategoryOptions, useCategories, useSend } from "../shared";

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

  return (
    <div className="flex flex-col gap-6">
      {error && <p className="text-sm text-red-600">{error.message}</p>}
      <ul className="flex flex-col gap-1">
        {tree.map((c) => (
          <li key={c.id} className={`flex flex-wrap items-center gap-1 ${c.parentId ? "pl-6" : ""}`}>
            <input className="input w-12 px-1 text-center" defaultValue={c.icon} onBlur={(e) => update(c.id, "icon", e.target.value)} />
            <input className="input min-w-0 flex-1" defaultValue={c.name} onBlur={(e) => update(c.id, "name", e.target.value)} />
            <input type="color" className="h-9 w-9" defaultValue={c.color} onBlur={(e) => update(c.id, "color", e.target.value)} />
            <button onClick={() => move(c, -1)} aria-label="Move up">↑</button>
            <button onClick={() => move(c, 1)} aria-label="Move down">↓</button>
            {!c.builtin && (
              <button className="text-red-600" onClick={() => setDeleting(c.id)} aria-label="Delete">
                ✕
              </button>
            )}
            {deleting === c.id && (
              <div className="flex w-full items-center gap-2 text-sm">
                Move its expenses to
                <select className="input" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                  <option value="">Uncategorised</option>
                  <CategoryOptions categories={categories} except={c.id} />
                </select>
                <button className="text-red-600" onClick={() => remove(c.id)}>
                  Delete
                </button>
                <button onClick={() => setDeleting(null)}>Cancel</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="flex flex-wrap gap-1">
        <input className="input w-12 px-1 text-center" value={draft.icon} onChange={(e) => setDraft({ ...draft, icon: e.target.value })} />
        <input
          className="input min-w-0 flex-1"
          placeholder="New category"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
        <input type="color" className="h-9 w-9" value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })} />
        <select className="input" value={draft.parentId} onChange={(e) => setDraft({ ...draft, parentId: e.target.value })}>
          <option value="">Top level</option>
          {categories
            .filter((p) => p.parentId === null)
            .map((p) => (
              <option key={p.id} value={p.id}>
                in {p.name}
              </option>
            ))}
        </select>
        <button className={`${button} px-4`}>Add</button>
      </form>
      <section>
        <h2 className="mb-2 font-semibold">Tags</h2>
        {tags.length === 0 && <p className="text-sm text-zinc-500">No tags yet.</p>}
        <ul className="flex flex-wrap gap-2 text-sm">
          {tags.map((t) => (
            <li key={t.id} className="flex gap-1 rounded bg-zinc-100 px-2 py-1 dark:bg-zinc-800">
              <button onClick={() => renameTag(t)}>#{t.name}</button>
              <button className="text-red-600" onClick={() => deleteTag(t)} aria-label="Delete tag">
                ✕
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
