import { useState } from "react";
import { z } from "zod";
import { FormError } from "../../components/form";
import { Icon, paths } from "../../components/icon";
import { panel, sectionHead } from "../../components/styles";
import { useApi, useSendNow } from "../../lib/api";
import { member, type Request } from "../../lib/schemas";
import { AddMember } from "./add-member";
import { MemberRow } from "./member-row";

export function Members() {
  const query = useApi(z.array(member), ["/api/users"], { throwOnError: false });
  const members = query.data ?? [];
  const mutation = useSendNow("users");
  const [open, setOpen] = useState<string | null>(null);
  const send = (...request: Request) => mutation.mutate(request, { onSuccess: () => setOpen(null) });
  function show(next: string | null) {
    mutation.reset();
    setOpen(next);
  }

  return (
    <section>
      <h2 className={sectionHead}>Members</h2>
      {query.isPending && <p role="status">Loading members…</p>}
      <FormError error={query.error} />
      {query.isError && (
        <button type="button" className="press text-accent" onClick={() => void query.refetch()}>
          Try again
        </button>
      )}
      {query.data && (
        <ul className={panel}>
          {members.map((m) => (
            <MemberRow key={m.id} member={m} open={open} onOpen={show} send={send} pending={mutation.isPending} />
          ))}
          <li>
            {open === "add" ? (
              <AddMember
                pending={mutation.isPending}
                onAdd={(body) => send("POST", "/api/users", body)}
                onCancel={() => setOpen(null)}
              />
            ) : (
              <button
                type="button"
                className="press flex h-[52px] w-full items-center gap-3 px-4 font-medium text-accent hover:bg-surface2"
                onClick={() => show("add")}
              >
                <span aria-hidden className="grid size-9 place-items-center">
                  <Icon d={paths.plus} className="size-[18px] stroke-2" />
                </span>
                Add member
              </button>
            )}
          </li>
        </ul>
      )}
      <FormError error={mutation.error} className="mt-2 px-1" />
    </section>
  );
}
