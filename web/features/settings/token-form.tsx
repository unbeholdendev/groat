import type { UseMutationResult } from "@tanstack/react-query";
import { Button } from "../../components/button";
import { Field, Input } from "../../components/form";
import type { Request } from "../../lib/schemas";
import { useZodForm } from "../../lib/use-zod-form";
import { tokenName } from "./schema";

export function TokenForm({ create }: { create: UseMutationResult<unknown, Error, Request> }) {
  const { register, handleSubmit, reset, formState } = useZodForm(tokenName, { name: "" });
  return (
    <form onSubmit={handleSubmit((body) => create.mutate(["POST", "/api/tokens", body], { onSuccess: () => reset() }))} className="flex gap-2 p-3">
      <Field className="min-w-0 flex-1" error={formState.errors.name?.message}>
        <Input {...register("name")} aria-label="Token name" placeholder="Name, like iPhone" />
      </Field>
      <Button variant="primary" type="submit" disabled={create.isPending}>
        Create
      </Button>
    </form>
  );
}
