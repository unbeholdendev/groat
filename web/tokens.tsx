import { type FormEvent, useState } from "react";
import { z } from "zod";
import { apiToken, useApi, useSend } from "./api";
import { dayLabel } from "./dates";
import { SettingsIcon } from "./settings-form";
import { divide, panel, sectionHead } from "./ui";

const secret = z.object({ token: z.string() });

export function Tokens() {
  const tokens = useApi(z.array(apiToken), ["/api/tokens"]).data ?? [];
  const create = useSend();
  const revoke = useSend();
  const [name, setName] = useState("");
  const [copied, setCopied] = useState(false);
  const shown = secret.safeParse(create.data);

  function submit(e: FormEvent) {
    e.preventDefault();
    setCopied(false);
    create.mutate(["POST", "/api/tokens", { name }], { onSuccess: () => setName("") });
  }

  return (
    <section>
      <h2 className={sectionHead}>API tokens</h2>
      <p className="-mt-1 mb-3 px-1 text-[13px] text-ink2">Let a phone shortcut add expenses by posting text to /api/capture.</p>
      {shown.success && (
        <div className="rise mb-3 rounded-panel bg-amber-soft p-4 text-sm">
          <p className="font-medium text-amber">Copy it now. It won’t be shown again.</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="num min-w-0 flex-1 truncate">{shown.data.token}</code>
            <button type="button" className="quiet h-9 bg-surface text-[13px]" onClick={() => navigator.clipboard.writeText(shown.data.token).then(() => setCopied(true))}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}
      <ul className={panel}>
        {tokens.map((t) => (
          <li key={t.id} className={`flex h-[62px] items-center gap-3 px-4 ${divide}`}>
            <SettingsIcon>
              <circle cx="8" cy="15" r="4" />
              <path d="m11 12 8-8m-3 3 2 2" />
            </SettingsIcon>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{t.name}</span>
              <span className="block text-xs font-medium text-ink3">{t.lastUsedAt ? `Last used ${dayLabel(t.lastUsedAt.slice(0, 10))}` : "Never used"}</span>
            </span>
            <button className="press hit rounded-chip px-2.5 py-1.5 text-[13px] font-medium text-up" onClick={() => revoke.mutate(["DELETE", `/api/tokens/${t.id}`])}>
              Revoke
            </button>
          </li>
        ))}
        <li>
          <form onSubmit={submit} className="flex gap-2 p-3">
            <input className="input min-w-0 flex-1" aria-label="Token name" placeholder="Name, like iPhone" value={name} onChange={(e) => setName(e.target.value)} required />
            <button className="primary" disabled={create.isPending}>
              Create
            </button>
          </form>
        </li>
      </ul>
      {create.error && <p className="mt-2 px-1 text-sm text-up">{create.error.message}</p>}
    </section>
  );
}
