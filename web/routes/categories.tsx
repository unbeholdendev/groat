import { type FormEvent, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { type Category, expense, tag as tagSchema, useApi, useCategories, useSend } from "../api";
import { z } from "zod";
import { CategoryOptions, Tile } from "../category";
import { Confirm, divide, Icon } from "../ui";

export const Route = createFileRoute("/categories")({ component: Categories });

type Tag = z.infer<typeof tagSchema>;
type Form = { name: string; icon: string; color: string; parentId: string };

const blank: Form = { name: "", icon: "📁", color: "#71717a", parentId: "" };
const text = "h-11 rounded-chip px-2.5 text-[13px] font-medium";

function Categories() {
  const categories = useCategories();
  const tags = useApi(z.array(tagSchema), ["/api/tags"]).data ?? [];
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [form, setForm] = useState(blank);
  const [reorder, setReorder] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [moveTo, setMoveTo] = useState("");
  const [tag, setTag] = useState<Tag & { deleting?: boolean }>();
  const { mutate: call, error, reset } = useSend();
  const affected = useApi(z.array(expense), ["/api/expenses?", `category=${editing}`], { enabled: deleting && typeof editing === "number" }).data;

  function edit(c?: Category) {
    setForm(c ? { name: c.name, icon: c.icon, color: c.color, parentId: "" } : blank);
    setEditing(c?.id ?? "new");
    setDeleting(false);
    setMoveTo("");
    reset();
  }

  function save(e: FormEvent) {
    e.preventDefault();
    call(
      editing === "new"
        ? ["POST", "/api/categories", { ...form, parentId: Number(form.parentId) || null }]
        : ["PUT", `/api/categories/${editing}`, form],
      { onSuccess: () => setEditing(null) },
    );
  }

  function move(c: Category, by: number) {
    const siblings = categories.filter((s) => s.parentId === c.parentId);
    const other = siblings[siblings.indexOf(c) + by];
    if (!other) return;
    const ids = siblings.map((s) => (s === c ? other.id : s === other ? c.id : s.id));
    call(["PUT", "/api/categories/order", ids]);
  }

  function remove(id: number) {
    setEditing(null);
    call(["DELETE", `/api/categories/${id}${moveTo ? `?moveTo=${moveTo}` : ""}`]);
  }

  function renameTag(e: FormEvent) {
    e.preventDefault();
    if (tag) call(["PUT", `/api/tags/${tag.id}`, { name: tag.name }], { onSuccess: () => setTag(undefined) });
  }

  const tree = categories
    .filter((p) => p.parentId === null)
    .flatMap((p) => [p, ...categories.filter((c) => c.parentId === p.id)]);
  const editor = (c?: Category) => (
    <form onSubmit={save} className="rise flex flex-col gap-3 p-4">
      <div className="flex gap-2">
        <label className="label w-14">
          Emoji
          <input className="input px-0 text-center" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} />
        </label>
        <label className="label min-w-0 flex-1">
          Name
          <input className="input" autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
      </div>
      <div className="flex gap-2">
        <label className="label w-32">
          Colour
          <span className="input relative flex items-center gap-2">
            <span className="size-[7px] rounded-full" style={{ background: form.color }} />
            {form.color}
            <input
              type="color"
              className="absolute inset-0 size-full cursor-pointer opacity-0"
              value={form.color}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
            />
          </span>
        </label>
        {!c && (
          <label className="label min-w-0 flex-1">
            Inside
            <select className="input" value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })}>
              <option value="">Nothing (top level)</option>
              {categories
                .filter((p) => p.parentId === null)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.icon} {p.name}
                  </option>
                ))}
            </select>
          </label>
        )}
      </div>
      {deleting && c ? (
        <div className="flex flex-col gap-2 text-sm text-ink2">
          <label className="label">
            {affected ? `${affected.length} ${affected.length === 1 ? "expense" : "expenses"}` : "Its expenses"}
            {c.parentId === null && categories.some((s) => s.parentId === c.id) && " (subcategories included)"} will move to
            <select className="input" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
              <option value="">Uncategorised</option>
              <CategoryOptions categories={categories} except={c.id} />
            </select>
          </label>
          <div className="flex justify-end">
            <button type="button" className={`${text} text-ink2`} onClick={() => setDeleting(false)}>
              Keep
            </button>
            <button type="button" className={`${text} text-up`} onClick={() => remove(c.id)}>
              Delete {c.name}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center">
          {c && !c.builtin && (
            <button type="button" className={`${text} -ml-2.5 text-up`} onClick={() => setDeleting(true)}>
              Delete
            </button>
          )}
          <button type="button" className={`${text} ml-auto text-ink2`} onClick={() => setEditing(null)}>
            Cancel
          </button>
          <button className="primary">{c ? "Save" : "Add"}</button>
        </div>
      )}
    </form>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-display font-bold">Categories</h1>
        <button className={`${text} -mr-2.5 text-ink2`} onClick={() => {
            setReorder(!reorder);
            setEditing(null);
          }}>
          {reorder ? "Done" : "Reorder"}
        </button>
      </div>
      {error && <p className="text-sm text-up">{error.message}</p>}
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
                  onClick={() => edit(c)}
                >
                  <Tile category={c} small={!!c.parentId} />
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                </button>
                {reorder &&
                  [-1, 1].map((by) => (
                    <button key={by} className="grid size-11 place-items-center text-ink3" onClick={() => move(c, by)} aria-label={by < 0 ? "Move up" : "Move down"}>
                      <Icon className={`size-4 stroke-2 ${by < 0 ? "rotate-180" : ""}`}>
                        <path d="m6 9 6 6 6-6" />
                      </Icon>
                    </button>
                  ))}
              </li>
            ),
          )}
          {editing === "new" && <li>{editor()}</li>}
        </ul>
        {editing !== "new" && !reorder && (
          <button className={`${text} mt-2 ml-1.5 flex items-center gap-1.5 text-ink2`} onClick={() => edit()}>
            <Icon className="size-4 stroke-2">
              <path d="M12 5v14M5 12h14" />
            </Icon>
            New category
          </button>
        )}
      </div>
      <section>
        <h2 className="pb-2 text-[13px] font-medium text-ink2">Tags</h2>
        {tags.length === 0 && <p className="text-sm text-ink3">No tags yet. Add one to an expense with #name.</p>}
        <ul className="flex flex-wrap gap-2 text-sm">
          {tags.map((t) =>
            tag?.id !== t.id ? (
              <li key={t.id} className="flex items-center rounded-chip border border-line2 bg-surface">
                <button className="hit py-1 pr-1 pl-2.5" onClick={() => (reset(), setTag(t))}>
                  #{t.name}
                </button>
                <button
                  className="relative grid h-7 w-9 place-items-center text-ink3 before:absolute before:-inset-y-2 before:left-0 before:-right-2 hover:text-up"
                  onClick={() => setTag({ ...t, deleting: true })}
                  aria-label={`Delete #${t.name}`}
                >
                  <Icon className="size-3.5 stroke-2">
                    <path d="M6 6l12 12M18 6 6 18" />
                  </Icon>
                </button>
              </li>
            ) : tag.deleting ? (
              <li key={t.id}>
                <Confirm
                  ask={`Remove #${t.name} from every expense?`}
                  yes="Delete"
                  onYes={() => (setTag(undefined), call(["DELETE", `/api/tags/${t.id}`]))}
                  onNo={() => setTag(undefined)}
                />
              </li>
            ) : (
              <li key={t.id}>
                <form onSubmit={renameTag}>
                  <input
                    aria-label={`Rename #${t.name}`}
                    className="input h-[30px] w-36 rounded-chip px-2.5 text-sm"
                    autoFocus
                    value={tag.name}
                    onChange={(e) => setTag({ ...tag, name: e.target.value })}
                    onKeyDown={(e) => e.key === "Escape" && setTag(undefined)}
                    onBlur={() => setTag(undefined)}
                  />
                </form>
              </li>
            ),
          )}
        </ul>
      </section>
    </div>
  );
}
