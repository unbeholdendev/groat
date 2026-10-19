import { Button } from "../../components/button";
import { Confirm } from "../../components/confirm";
import { divide } from "../../components/styles";
import type { z } from "zod";
import type { member, Request } from "../../lib/schemas";
import { ResetPassword } from "./reset-password";

type Props = { member: z.infer<typeof member>; open: string | null; onOpen: (open: string | null) => void; send: (...request: Request) => void; pending: boolean };

export function MemberRow({ member: m, open, onOpen, send, pending }: Props) {
  const password = `password ${m.id}`;
  const remove = `remove ${m.id}`;
  return (
    <li className={`px-4 ${divide}`}>
      <div className="flex h-[62px] items-center gap-3">
        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-chip bg-accent-soft font-semibold text-accent uppercase">
          {m.username[0]}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{m.username}</span>
          <span className="block text-xs font-medium text-ink3">{m.role === "admin" ? "Admin" : "Member"}</span>
        </span>
        {open === remove ? (
          <Confirm ask="Remove?" yes="Remove" onYes={() => send("DELETE", `/api/users/${m.id}`)} onNo={() => onOpen(null)} />
        ) : (
          <span className="flex gap-1 text-[13px] font-medium">
            <Button aria-expanded={open === password} onClick={() => onOpen(open === password ? null : password)}>
              Reset password
            </Button>
            {m.role !== "admin" && (
              <Button tone="up" onClick={() => onOpen(remove)}>
                Remove
              </Button>
            )}
          </span>
        )}
      </div>
      {open === password && <ResetPassword username={m.username} pending={pending} onSave={(body) => send("PUT", `/api/users/${m.id}/password`, body)} />}
    </li>
  );
}
