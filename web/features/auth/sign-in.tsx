import { Button } from "../../components/button";
import { Field, FormError, Input } from "../../components/form";
import { Masthead } from "../../components/masthead";
import { useSendNow } from "../../lib/api";
import { useZodForm } from "../../lib/use-zod-form";
import { credentials } from "./schema";

export function SignIn({ setup }: { setup: boolean }) {
  const mutation = useSendNow();
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
      <Button variant="primary" type="submit" disabled={mutation.isPending}>
        {setup ? "Create account" : "Sign in"}
      </Button>
    </form>
  );
}
