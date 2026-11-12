import { useState } from "react";
import { Controller } from "react-hook-form";
import { kinds, type Kind } from "../../../shared/schema";
import { Button } from "../../components/button";
import { Field, FormError, Input, Select } from "../../components/form";
import { Segmented } from "../../components/segmented";
import { useSend } from "../../lib/api";
import type { Category } from "../../lib/schemas";
import { useZodForm } from "../../lib/use-zod-form";
import { ColourPicker, palette } from "./colour-picker";
import { DeleteCategory } from "./delete-category";
import { MoveKind } from "./move-kind";
import { categoryForm } from "./schema";

export function CategoryEditor(props: {
  category?: Category;
  kind: Kind;
  categories: Category[];
  onClose: () => void;
  onDelete: (moveTo: string) => void;
}) {
  const { category: c, categories } = props;
  const form = useZodForm(categoryForm, {
    name: c?.name ?? "",
    icon: c?.icon ?? "📁",
    color: c?.color ?? palette.Rose,
    parentId: "",
    kind: props.kind,
  });
  const { errors } = form.formState;
  const save = useSend("category");
  const [deleting, setDeleting] = useState(false);
  const [moving, setMoving] = useState(false);
  const kind = form.watch("kind");
  const send = form.handleSubmit(({ parentId, kind, ...fields }) =>
    save.mutate(
      c
        ? ["PUT", `/api/categories/${c.id}`, kind === c.kind ? fields : { ...fields, kind }]
        : ["POST", "/api/categories", { ...fields, parentId, kind }],
      {
        onSuccess: props.onClose,
      },
    ),
  );
  const submit = c && kind !== c.kind ? form.handleSubmit(() => setMoving(true)) : send;

  return (
    <form onSubmit={submit} className="rise flex flex-col gap-3 p-4">
      <div className="flex gap-2">
        <Field label="Emoji" error={errors.icon?.message} className="w-14">
          <Input className="px-0 text-center" {...form.register("icon")} />
        </Field>
        <Field label="Name" error={errors.name?.message} className="min-w-0 flex-1">
          <Input autoFocus {...form.register("name")} />
        </Field>
      </div>
      <Controller
        control={form.control}
        name="color"
        render={({ field, fieldState }) => (
          <ColourPicker value={field.value} onChange={field.onChange} error={fieldState.error?.message} />
        )}
      />
      {!c && (
        <Field label="Inside">
          <Select {...form.register("parentId")}>
            <option value="">Nothing (top level)</option>
            {categories
              .filter((p) => p.parentId === null && p.kind === kind)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.icon} {p.name}
                </option>
              ))}
          </Select>
        </Field>
      )}
      {c && c.parentId === null && !c.builtin && (
        <Controller
          control={form.control}
          name="kind"
          render={({ field }) => (
            <Segmented
              label="Kind"
              options={kinds}
              names={{ expense: "Expense", income: "Income" }}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
      )}
      <FormError error={save.error} />
      {footer()}
    </form>
  );

  function footer() {
    if (moving && c)
      return (
        <MoveKind category={c} kind={kind} categories={categories} onKeep={() => setMoving(false)} onMove={send} />
      );
    if (deleting && c)
      return (
        <DeleteCategory
          category={c}
          categories={categories}
          onKeep={() => setDeleting(false)}
          onDelete={props.onDelete}
        />
      );
    return (
      <div className="flex items-center">
        {c && !c.builtin && (
          <Button tone="up" className="-ml-2.5 h-11" onClick={() => setDeleting(true)}>
            Delete
          </Button>
        )}
        <Button className="ml-auto h-11" onClick={props.onClose}>
          Cancel
        </Button>
        <Button variant="primary" type="submit">
          {c ? "Save" : "Add"}
        </Button>
      </div>
    );
  }
}
