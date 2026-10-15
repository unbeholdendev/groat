import type { FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import type { Request } from "./api";

export function SignIn({ setup }: { setup: boolean }) {
  // Paused mutations are persisted to localStorage; never let the password queue offline.
  const mutation = useMutation<unknown, Error, Request>({ mutationKey: ["send"], networkMode: "always" });

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    mutation.mutate(["POST", setup ? "/api/setup" : "/api/login", Object.fromEntries(new FormData(e.currentTarget))]);
  }

  return (
    <form onSubmit={submit} onChangeCapture={() => mutation.reset()} className="flex flex-col gap-4">
      <h1 className="text-display font-bold">{setup ? "Welcome" : "Sign in"}</h1>
      {setup && <p className="-mt-2 text-ink2">Create the admin account. Anything already saved stays as it is.</p>}
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
