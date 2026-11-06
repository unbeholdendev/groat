import { useState } from "react";
import { useMutationState, useQueryClient } from "@tanstack/react-query";
import { Button } from "../../components/button";
import { Field, Input } from "../../components/form";
import { panel } from "../../components/styles";
import { useSession } from "../../lib/api";
import { request } from "../../lib/schemas";

export function Outbox() {
  const client = useQueryClient();
  const owner = useSession()?.user?.username;
  const changes = useMutationState({
    filters: { predicate: (m) => !!m.meta?.retained && m.state.status !== "success" && m.meta.owner === owner },
    select: (m) => ({ id: m.mutationId, status: m.state.status, paused: m.state.isPaused, variables: m.state.variables, error: m.state.error?.message }),
  });
  if (!changes.length) return null;
  return <section aria-label="Unsent changes" className={`mt-5 p-4 ${panel}`}>
    <h2 className="font-semibold">Unsent changes</h2>
    <p className="mt-1 text-sm text-ink2">These changes still need server confirmation.</p>
    <div className="mt-3 space-y-4">{changes.map((change) => <Unsent key={change.id} change={change} onRetry={() => {
      const m = client.getMutationCache().getAll().find((m) => m.mutationId === change.id);
      if (!m) return;
      const next = client.getMutationCache().build(client, { mutationKey: m.options.mutationKey, meta: m.meta, gcTime: Infinity });
      client.getMutationCache().remove(m);
      void next.execute(m.state.variables).catch(() => {});
    }} onDiscard={() => {
      const m = client.getMutationCache().getAll().find((m) => m.mutationId === change.id);
      if (m) client.getMutationCache().remove(m);
    }} onEdit={(note, amount) => {
      const m = client.getMutationCache().getAll().find((m) => m.mutationId === change.id);
      const r = request.safeParse(m?.state.variables).data;
      if (!m || !r || (m.state.status === "pending" && !m.state.isPaused)) return;
      const body = r[2] as Record<string, unknown>;
      const next = client.getMutationCache().build(client, { mutationKey: m.options.mutationKey, gcTime: Infinity, meta: { ...m.meta, edited: true } }, { ...m.state, variables: [r[0], r[1], { ...body, note, amount }] });
      client.getMutationCache().remove(m);
      if (next.state.isPaused) void next.continue().catch(() => {});
    }} />)}</div>
  </section>;
}

type Change = { id: number; status: string; paused: boolean; variables: unknown; error?: string };
function Unsent({ change, onRetry, onDiscard, onEdit }: { change: Change; onRetry: () => void; onDiscard: () => void; onEdit: (note: string, amount: string) => void }) {
  const r = request.safeParse(change.variables).data;
  const body = r?.[2] as { note?: string; amount?: string | number; currency?: string } | undefined;
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(body?.note ?? "");
  const [amount, setAmount] = useState(String(body?.amount ?? ""));
  const resources: Record<string, string> = { transactions: "expense", categories: "category", recurring: "recurring expense", settings: "settings", tags: "tag", bin: "bin" };
  const action = r?.[0] === "DELETE" ? "Delete" : r?.[0] === "POST" ? "Add" : "Update";
  const label = `${action} ${resources[r?.[1].split("/")[2] ?? ""] ?? "change"}`;
  const busy = change.status === "pending" && !change.paused;
  return <div role="group" aria-label={body?.note ?? "Unsent change"}>
    <p className="font-medium">{body?.note ?? label}</p>
    <p role="status" className="mt-1 text-sm text-ink2">{change.error ?? (change.paused ? "Waiting for a connection" : "Syncing…")}</p>
    {editing ? <form className="mt-2 grid gap-3" onSubmit={(e) => { e.preventDefault(); onEdit(note, amount); setEditing(false); }}>
      <Field label="Note"><Input value={note} onChange={(e) => setNote(e.target.value)} required /></Field>
      <Field label="Amount"><Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" required /></Field>
      <div><Button type="submit" tone="accent" disabled={busy}>Keep changes</Button><Button onClick={() => setEditing(false)}>Cancel</Button></div>
    </form> : <div className="mt-2 flex gap-3">
      <Button tone="accent" disabled={busy || change.paused} onClick={onRetry}>Retry</Button>
      {body?.note != null && r?.[1].startsWith("/api/transactions") && <Button disabled={busy} onClick={() => setEditing(true)}>Edit</Button>}
      <Button tone="up" disabled={busy} onClick={onDiscard}>Discard</Button>
    </div>}
  </div>;
}
