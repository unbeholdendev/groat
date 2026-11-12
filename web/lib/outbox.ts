import { type MutationCacheNotifyEvent, onlineManager, type QueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { send } from "./api";
import { isLocallySignedOut } from "./device";
import { type Request, transaction } from "./schemas";
import { watchSession } from "./session";

const fields = z.record(z.string(), z.unknown()).catch({});
const queuedContext = z.object({ queued: z.boolean() }).partial();
const isNewTransaction = (r: [string, string, ...unknown[]]) => r[0] === "POST" && r[1] === "/api/transactions";

export function addRequestId(r: [string, string, ...unknown[]]): Request {
  if (isNewTransaction(r)) {
    const body = fields.parse(r[2]);
    r[2] = { ...body, requestId: body.requestId ?? uuid() };
  }
  return [r[0], r[1], r[2]];
}
// crypto.randomUUID only exists on HTTPS and localhost.
function uuid() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// In mutationFn, not onSuccess: a hook's onSuccess replaces the default, and only defaults survive a reload.
export const sync = (
  client: QueryClient,
  key: string[],
  patch: (client: QueryClient, data: unknown, request: Request) => unknown,
) =>
  client.setMutationDefaults(key, {
    onMutate: (r: Request, { meta }) => {
      addRequestId(r);
      return { queued: !meta?.transient && !onlineManager.isOnline() };
    },
    mutationFn: async (r: Request, { client, meta }) => {
      if (
        !client
          .getMutationCache()
          .getAll()
          .some((m) => m.state.variables === r)
      )
        throw new Error("This change was removed");
      if (isLocallySignedOut()) throw new Error("Sign in before retrying this change");
      const owner = typeof meta?.owner === "string" ? meta.owner : "";
      if (!owner) throw Object.assign(new Error("Sign in as the original user to sync this change"), { status: 401 });
      const current = watchSession(client, owner);
      let data = await send(r[0], r[1], r[2], owner);
      current();
      if (meta?.edited && isNewTransaction(r)) {
        const { id } = transaction.parse(data);
        data = await send("PUT", `/api/transactions/${id}`, r[2], owner);
        current();
      }
      await patch(client, data, r);
      current();
      return data;
    },
  });

export function retain(client: QueryClient, { type, mutation: m }: MutationCacheNotifyEvent) {
  if (m && (m.state.isPaused || queuedContext.safeParse(m.state.context).data?.queued) && !m.meta?.retained)
    m.setOptions({ ...m.options, gcTime: Infinity, meta: { ...m.meta, retained: true } });
  if (type === "updated" && m?.meta?.retained && m.state.status === "success") client.getMutationCache().remove(m);
}
