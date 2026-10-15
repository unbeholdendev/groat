import { type FormEvent, useState } from "react";
import { z } from "zod";
import { apiToken, useApi, useSend } from "./api";
import { dayLabel } from "./dates";

const secret = z.object({ token: z.string() });

export function Tokens() {
  const tokens = useApi(z.array(apiToken), ["/api/tokens"]).data ?? [];
  const create = useSend();
  const revoke = useSend();
  const [name, setName] = useState("");
  const shown = secret.safeParse(create.data);

  function submit(e: FormEvent) {
    e.preventDefault();
    create.mutate(["POST", "/api/tokens", { name }], { onSuccess: () => setName("") });
  }

  return (
    <section className="mt-8">
      <h2 className="font-semibold">API tokens</h2>
      <p className="mt-1 text-sm text-ink2">Let a phone shortcut add expenses by posting text to /api/capture.</p>
      {shown.success && (
        <div className="mt-3 rounded-panel bg-amber-soft p-3 text-sm">
          <p className="font-medium text-amber">Copy it now. It won’t be shown again.</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate">{shown.data.token}</code>
            <button type="button" className="quiet" onClick={() => navigator.clipboard.writeText(shown.data.token)}>
              Copy
            </button>
          </div>
        </div>
      )}
      <ul className="mt-3">
        {tokens.map((t) => (
          <li key={t.id} className="flex items-center justify-between border-b border-line py-3">
            <span className="min-w-0">
              <span className="block truncate">{t.name}</span>
              <span className="block text-xs text-ink3">{t.lastUsedAt ? `Last used ${dayLabel(t.lastUsedAt.slice(0, 10))}` : "Never used"}</span>
            </span>
            <button className="hit text-up" onClick={() => revoke.mutate(["DELETE", `/api/tokens/${t.id}`])}>
              Revoke
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={submit} className="mt-3 flex gap-2">
        <input className="input flex-1" aria-label="Token name" placeholder="iPhone" value={name} onChange={(e) => setName(e.target.value)} required />
        <button className="primary" disabled={create.isPending}>
          Create
        </button>
      </form>
      {create.error && <p className="mt-2 text-sm text-up">{create.error.message}</p>}
    </section>
  );
}
