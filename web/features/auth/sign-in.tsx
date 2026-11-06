import { useState } from "react";
import { useMutationState, useQueryClient } from "@tanstack/react-query";
import { Button } from "../../components/button";
import { Field, FormError, Input } from "../../components/form";
import { Masthead } from "../../components/masthead";
import { useSendNow } from "../../lib/api";
import { useZodForm } from "../../lib/use-zod-form";
import { Restore } from "./restore";
import { credentials } from "./schema";

export function SignIn({ setup }: { setup: boolean }) {
  const mutation = useSendNow();
  const client = useQueryClient();
  const unsent = useMutationState({ filters: { predicate: (m) => !!m.meta?.retained && m.state.status !== "success" } }).length;
  const [clearing, setClearing] = useState(false);
  const { register, handleSubmit, formState } = useZodForm(credentials, { username: "", password: "" });
  const { errors } = formState;

  return (
    <form onSubmit={handleSubmit((body) => mutation.mutate(["POST", setup ? "/api/setup" : "/api/login", body]))} onChangeCapture={() => mutation.reset()} className="flex flex-col gap-4">
      <Masthead className="mb-3" title={setup ? "Welcome" : "Sign in"}>
        {setup ? "Create the admin account. Anything already saved stays as it is." : "Your expenses, on your own server."}
      </Masthead>
      <Field label="Username" error={errors.username?.message}>
        <Input {...register("username")} autoComplete="username" autoCapitalize="none" />
      </Field>
      <Field label="Password" error={errors.password?.message}>
        <Input {...register("password")} type="password" autoComplete={setup ? "new-password" : "current-password"} />
      </Field>
      <FormError error={mutation.error} />
      {unsent > 0 && <div className="text-sm text-ink2">
        <p>{unsent} unsent {unsent === 1 ? "change remains" : "changes remain"} on this device. Sign in with the same account to recover them.</p>
        {clearing ? <><p className="mt-2">Remove these changes permanently?</p><Button tone="up" onClick={() => {
          client.getMutationCache().getAll().filter((m) => m.meta?.retained).forEach((m) => client.getMutationCache().remove(m));
          mutation.reset(); setClearing(false);
        }}>Remove unsent changes</Button><Button onClick={() => setClearing(false)}>Keep changes</Button></> : <Button onClick={() => setClearing(true)}>Clear unsent changes</Button>}
      </div>}
      {!setup && <p className="text-sm text-ink2">Forgot your password? Ask a household admin to reset it. Admins can recover access using the server’s README.</p>}
      <Button variant="primary" type="submit" disabled={mutation.isPending}>
        {setup ? "Create account" : "Sign in"}
      </Button>
      {setup && <Restore />}
    </form>
  );
}
