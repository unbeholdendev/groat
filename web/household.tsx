import { type FormEvent, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { member, type Request, useApi } from "./api";
import { Confirm, divide, Icon, panel, sectionHead } from "./ui";

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
    <section>
      <h2 className={sectionHead}>Household</h2>
      <ul className={panel}>
        {members.map((m) => (
          <li key={m.id} className={`px-4 ${divide}`}>
            <div className="flex h-[62px] items-center gap-3">
              <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-chip bg-accent-soft font-semibold text-accent uppercase">
                {m.username[0]}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{m.username}</span>
                <span className="block text-xs font-medium text-ink3">{m.role === "admin" ? "Admin" : "Member"}</span>
              </span>
              {open === `remove ${m.id}` ? (
                <Confirm ask="Remove?" yes="Remove" onYes={() => mutation.mutate(["DELETE", `/api/users/${m.id}`], { onSuccess: () => setOpen(null) })} onNo={() => setOpen(null)} />
              ) : (
                <span className="flex gap-1 text-[13px] font-medium">
                  <button className="press hit rounded-chip px-2.5 py-1.5 text-ink2" onClick={() => (mutation.reset(), setOpen(open === `password ${m.id}` ? null : `password ${m.id}`))}>
                    Reset password
                  </button>
                  {m.role !== "admin" && (
                    <button className="press hit rounded-chip px-2.5 py-1.5 text-up" onClick={() => (mutation.reset(), setOpen(`remove ${m.id}`))}>
                      Remove
                    </button>
                  )}
                </span>
              )}
            </div>
            {open === `password ${m.id}` && (
              <form onSubmit={(e) => submit(e, `/api/users/${m.id}/password`, "PUT")} className="rise flex gap-2 pb-4">
                <input name="password" type="password" aria-label={`New password for ${m.username}`} className="input min-w-0 flex-1" placeholder="New password" autoComplete="new-password" autoFocus required />
                <button className="primary" disabled={mutation.isPending}>
                  Save
                </button>
              </form>
            )}
          </li>
        ))}
        <li>
          {open === "add" ? (
            <form onSubmit={(e) => submit(e, "/api/users")} className="rise flex flex-col gap-2 p-4">
              <input name="username" aria-label="Username" className="input" placeholder="Username" autoComplete="off" autoCapitalize="none" autoFocus required />
              <input name="password" aria-label="Password" type="password" className="input" placeholder="Password" autoComplete="new-password" required />
              <div className="flex justify-end gap-1">
                <button type="button" className="press hit rounded-chip px-3 text-[13px] font-medium text-ink2" onClick={() => setOpen(null)}>
                  Cancel
                </button>
                <button className="primary" disabled={mutation.isPending}>
                  Add member
                </button>
              </div>
            </form>
          ) : (
            <button className="press flex h-[52px] w-full items-center gap-3 px-4 font-medium text-accent hover:bg-surface2" onClick={() => (mutation.reset(), setOpen("add"))}>
              <span aria-hidden className="grid size-9 place-items-center">
                <Icon className="size-[18px] stroke-2">
                  <path d="M12 5v14M5 12h14" />
                </Icon>
              </span>
              Add member
            </button>
          )}
        </li>
      </ul>
      {mutation.error && <p className="mt-2 px-1 text-sm text-up">{mutation.error.message}</p>}
    </section>
  );
}
