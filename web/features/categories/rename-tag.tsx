import { Field, Input } from "../../components/form";
import { useZodForm } from "../../lib/use-zod-form";
import { tagForm } from "./schema";
import type { Tag } from "./tags";

export function RenameTag({ tag, onSave, onCancel }: { tag: Tag; onSave: (name: string) => void; onCancel: () => void }) {
  const { register, handleSubmit, formState } = useZodForm(tagForm, { name: tag.name });
  return (
    <form onSubmit={handleSubmit(({ name }) => onSave(name))}>
      <Field error={formState.errors.name?.message}>
        <Input
          aria-label={`Rename #${tag.name}`}
          className="h-[30px] w-36 rounded-chip px-2.5 text-sm"
          autoFocus
          {...register("name")}
          onKeyDown={(e) => e.key === "Escape" && onCancel()}
          onBlur={onCancel}
        />
      </Field>
    </form>
  );
}
