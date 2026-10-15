import { type FormEvent, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { member, type Request, useApi } from "./api";
import { Confirm } from "./ui";

export function Household() {
  const members = useApi(z.array(member), ["/api/users"]).data ?? [];
  // Paused mutations are persisted to localStorage; never let a password queue offline.
  const mutation = useMutation<unknown, Error, Request>({ mutationKey: ["send"], networkMode: "always" });
  const [open, setOpen] = useState<string | null>(null);

  function submit(e: FormEvent<HTMLFormElement>, path: string, method = "POST") {
    e.preventDefault();
    mutation.mutate([method, path, Object.fromEntries(new FormData(e.currentTarget))], { onSuccess: () => setOpen(null) });
  }

  return (
    <section className="mt-6">
      <h2 className="mb-1.5 text-[13px] font-medium text-ink2">Household</h2>
      <ul className="border-t border-line">
        {members.map((m) => (
          <li key={m.id} className="border-b border-line py-3">
            <div className="flex items-center justify-between gap-2">
              <span>
                {m.username}
                {m.role === "admin" && <span className="ml-2 text-xs text-ink3">Admin</span>}
              </span>
              {open === `remove ${m.id}` ? (
                <Confirm ask={`Remove ${m.username}?`} yes="Remove" onYes={() => mutation.mutate(["DELETE", `/api/users/${m.id}`], { onSuccess: () => setOpen(null) })} onNo={() => setOpen(null)} />
              ) : (
                <span className="flex gap-3 text-sm text-ink2">
                  <button className="hit" onClick={() => (mutation.reset(), setOpen(`password ${m.id}`))}>
                    Reset password
                  </button>
                  {m.role !== "admin" && (
                    <button className="hit text-up" onClick={() => (mutation.reset(), setOpen(`remove ${m.id}`))}>
                      Remove
                    </button>
                  )}
                </span>
              )}
            </div>
            {open === `password ${m.id}` && (
              <form onSubmit={(e) => submit(e, `/api/users/${m.id}/password`, "PUT")} className="mt-3 flex gap-2">
                <input name="password" type="password" className="input flex-1" placeholder="New password" autoComplete="new-password" autoFocus required />
                <button className="primary" disabled={mutation.isPending}>
                  Save
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
      {open === "add" ? (
        <form onSubmit={(e) => submit(e, "/api/users")} className="mt-3 flex flex-col gap-3">
          <input name="username" className="input" placeholder="Username" autoComplete="off" autoCapitalize="none" autoFocus required />
          <input name="password" type="password" className="input" placeholder="Password" autoComplete="new-password" required />
          <button className="primary" disabled={mutation.isPending}>
            Add member
          </button>
        </form>
      ) : (
        <button className="hit mt-3 text-accent" onClick={() => (mutation.reset(), setOpen("add"))}>
          Add member
        </button>
      )}
      {mutation.error && <p className="mt-2 text-sm text-up">{mutation.error.message}</p>}
    </section>
  );
}
