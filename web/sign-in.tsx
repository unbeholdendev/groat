import type { FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import type { Request } from "./api";
import { Masthead } from "./ui";

export function SignIn({ setup }: { setup: boolean }) {
  // Paused mutations are persisted to localStorage; never let the password queue offline.
  const mutation = useMutation<unknown, Error, Request>({ mutationKey: ["send"], networkMode: "always" });

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    mutation.mutate(["POST", setup ? "/api/setup" : "/api/login", Object.fromEntries(new FormData(e.currentTarget))]);
  }

  return (
    <form onSubmit={submit} onChangeCapture={() => mutation.reset()} className="flex flex-col gap-4">
      <Masthead className="mb-3" title={setup ? "Welcome" : "Sign in"}>
        {setup ? "Create the admin account. Anything already saved stays as it is." : "Your expenses, on your own server."}
      </Masthead>
      <label className="label">
        Username
        <input name="username" className="input" autoComplete="username" autoCapitalize="none" required />
      </label>
      <label className="label">
        Password
        <input name="password" type="password" className="input" autoComplete={setup ? "new-password" : "current-password"} required />
      </label>
      {mutation.error && <p className="text-sm text-up">{mutation.error.message}</p>}
      <button className="primary" disabled={mutation.isPending}>
        {setup ? "Create account" : "Sign in"}
      </button>
    </form>
  );
}
