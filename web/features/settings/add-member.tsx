import { Button } from "../../components/button";
import { Field, Input } from "../../components/form";
import { useZodForm } from "../../lib/use-zod-form";
import { credentials } from "../auth/schema";

export function AddMember({ pending, onAdd, onCancel }: { pending: boolean; onAdd: (body: { username: string; password: string }) => void; onCancel: () => void }) {
  const { register, handleSubmit, formState } = useZodForm(credentials, { username: "", password: "" });
  const { errors } = formState;
  return (
    <form onSubmit={handleSubmit(onAdd)} className="rise flex flex-col gap-2 p-4">
      <Field error={errors.username?.message}>
        <Input {...register("username")} aria-label="Username" placeholder="Username" autoComplete="off" autoCapitalize="none" autoFocus />
      </Field>
      <Field error={errors.password?.message}>
        <Input {...register("password")} aria-label="Password" type="password" placeholder="Password" autoComplete="new-password" />
      </Field>
      <div className="flex justify-end gap-1">
        <button type="button" className="press hit rounded-chip px-3 text-[13px] font-medium text-ink2" onClick={onCancel}>
          Cancel
        </button>
        <Button variant="primary" type="submit" disabled={pending}>
          Add member
        </Button>
      </div>
    </form>
  );
}
