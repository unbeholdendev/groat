import { Button } from "../../components/button";
import { Field, Input } from "../../components/form";
import { useZodForm } from "../../lib/use-zod-form";
import { newPassword } from "./schema";

export function ResetPassword({ username, pending, onSave }: { username: string; pending: boolean; onSave: (body: { password: string }) => void }) {
  const { register, handleSubmit, formState } = useZodForm(newPassword, { password: "" });
  return (
    <form onSubmit={handleSubmit(onSave)} className="rise flex gap-2 pb-4">
      <Field className="min-w-0 flex-1" error={formState.errors.password?.message}>
        <Input {...register("password")} type="password" aria-label={`New password for ${username}`} placeholder="New password" autoComplete="new-password" autoFocus />
      </Field>
      <Button variant="primary" type="submit" disabled={pending}>
        Save
      </Button>
    </form>
  );
}
