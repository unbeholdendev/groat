import { useState } from "react";
import { Controller } from "react-hook-form";
import { Button } from "../../components/button";
import { Field, FormError, Input, Select } from "../../components/form";
import { useSend } from "../../lib/api";
import type { Category } from "../../lib/schemas";
import { useZodForm } from "../../lib/use-zod-form";
import { ColourPicker, palette } from "./colour-picker";
import { DeleteCategory } from "./delete-category";
import { categoryForm } from "./schema";

export function CategoryEditor(props: { category?: Category; categories: Category[]; onClose: () => void; onDelete: (moveTo: string) => void }) {
  const { category: c, categories } = props;
  const form = useZodForm(categoryForm, { name: c?.name ?? "", icon: c?.icon ?? "📁", color: c?.color ?? palette.Rose, parentId: "" });
  const { errors } = form.formState;
  const save = useSend();
  const [deleting, setDeleting] = useState(false);
  const submit = form.handleSubmit(({ parentId, ...fields }) =>
    save.mutate(c ? ["PUT", `/api/categories/${c.id}`, fields] : ["POST", "/api/categories", { ...fields, parentId }], { onSuccess: props.onClose }),
  );

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
        render={({ field, fieldState }) => <ColourPicker value={field.value} onChange={field.onChange} error={fieldState.error?.message} />}
      />
      {!c && (
        <Field label="Inside">
          <Select {...form.register("parentId")}>
            <option value="">Nothing (top level)</option>
            {categories
              .filter((p) => p.parentId === null)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.icon} {p.name}
                </option>
              ))}
          </Select>
        </Field>
      )}
      <FormError error={save.error} />
      {deleting && c ? (
        <DeleteCategory category={c} categories={categories} onKeep={() => setDeleting(false)} onDelete={props.onDelete} />
      ) : (
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
      )}
    </form>
  );
}
