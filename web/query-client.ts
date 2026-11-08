import { dehydrate, hydrate, keepPreviousData, MutationCache, onlineManager, QueryCache, QueryClient } from "@tanstack/react-query";
import { refresh, send } from "./lib/api";
import { isLocallySignedOut, lockDevice, storeCache, unlockDevice } from "./lib/device";
import { transaction, request, type Request } from "./lib/schemas";
import { syncCategory } from "./features/categories/queries";
import { syncTransaction } from "./features/transactions/queries";
import { syncAi, syncModels, syncSettings, syncToken, syncUsers } from "./features/settings/queries";

let endingSession: Promise<unknown> = Promise.resolve();
const endSession = () => (endingSession = fetch("/api/logout", { method: "POST", signal: AbortSignal.timeout(3000) }).catch(() => {}));

export const queryClient: QueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      placeholderData: keepPreviousData,
      gcTime: 864e5,
      retry: (n, e: Error & { status?: number }) => n < 3 && !(e.status && e.status < 500),
    },
  },
  queryCache: new QueryCache({ onError: signedOut }),
  mutationCache: new MutationCache({ onError: signedOut }),
});
function signedOut(e: Error & { status?: number }) {
  if (e.status === 401 || e.status === 409) queryClient.invalidateQueries({ queryKey: ["/api/session"] });
}
function identify(r: [string, string, ...unknown[]]): Request {
  if (r[0] === "POST" && r[1] === "/api/transactions") {
    const body = r[2] as Record<string, unknown>;
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
const sync = (key: string[], patch: (client: QueryClient, data: unknown, request: Request) => unknown) =>
  queryClient.setMutationDefaults(key, {
    onMutate: (r: Request, { meta }) => {
      identify(r);
      return { queued: !meta?.transient && !onlineManager.isOnline() };
    },
    mutationFn: async (r: Request, { client, meta }) => {
      const authentication = r[1] === "/api/login" || r[1] === "/api/setup";
      if (authentication) {
        await endingSession;
        const username = (r[2] as { username: string }).username.trim();
        const other = client.getMutationCache().getAll().find((m) => m.meta?.retained && m.state.status !== "success" && m.meta.owner !== username);
        if (other) throw new Error(`Unsent changes belong to ${other.meta?.owner ?? "the original user"}. Sign in with that account, or clear unsent changes first.`);
      }
      if (!authentication) {
        if (!client.getMutationCache().getAll().some((m) => m.state.variables === r)) throw new Error("This change was removed");
        if (isLocallySignedOut()) throw new Error("Sign in before retrying this change");
        if (!meta?.owner)
          throw Object.assign(new Error("Sign in as the original user to sync this change"), { status: 401 });
      }
      let data = await send(r[0], r[1], r[2], authentication ? undefined : String(meta?.owner));
      if (meta?.edited && r[0] === "POST" && r[1] === "/api/transactions") {
        const { id } = transaction.parse(data);
        data = await send("PUT", `/api/transactions/${id}`, r[2], String(meta.owner));
      }
      if (authentication) {
        unlockDevice();
        await client.cancelQueries();
        await client.resetQueries({ predicate: (q) => q.queryKey[0] !== "/api/session" && !(q.queryKey[0] === "transaction-draft" && q.queryKey[1] === (data as { username: string }).username) });
        client.setQueryData(["/api/session"], { setup: false, user: data });
      }
      await patch(client, data, r);
      return data;
    },
  });
sync(["send"], (client) => client.invalidateQueries());
sync(["send", "bin"], (client) => refresh(client, "/api/bin"));
sync(["send", "transaction"], syncTransaction);
sync(["send", "category"], syncCategory);
sync(["send", "settings"], syncSettings);
sync(["send", "token"], syncToken);
sync(["send", "users"], syncUsers);
sync(["send", "models"], syncModels);
sync(["send", "ai"], syncAi);

try {
  const cache = JSON.parse(localStorage.getItem("cache") ?? "null");
  if (cache && !isLocallySignedOut()) {
    const owner = cache.owner ?? cache.queries?.find((q: { queryKey: string[] }) => q.queryKey[0] === "/api/session")?.state.data?.user?.username;
    hydrate(queryClient, {
      queries: cache.build === import.meta.env.BUILD ? cache.queries : [],
      mutations: (cache.mutations ?? []).map((m: { meta?: Record<string, unknown>; state: { error?: { message?: string }; status?: string; isPaused?: boolean; variables?: unknown } }) => ({
        ...m, meta: { owner, ...m.meta, retained: true },
        state: { ...m.state, variables: identify(request.parse(m.state.variables)),
          ...(m.state.status === "pending" && !m.state.isPaused ? { status: "error", error: new Error("Sync was interrupted. Retry to check whether it saved.") } : { error: m.state.error ? new Error(m.state.error.message ?? "Couldn’t sync. Check this change and retry.") : null }),
        },
      })),
    }, { defaultOptions: { mutations: { gcTime: Infinity } } });
  }
} catch {}
onlineManager.setOnline(navigator.onLine);
let persisting: ReturnType<typeof setTimeout>;
export const persistCache = () => {
  clearTimeout(persisting);
  if (isLocallySignedOut()) return;
  const cache = dehydrate(queryClient, { shouldDehydrateMutation: (m) => !!m.meta?.retained && (m.state.status !== "success") });
  storeCache({ build: import.meta.env.BUILD, ...cache, mutations: cache.mutations.map((m) => ({
    ...m, state: { ...m.state, error: m.state.error ? { message: String(m.state.error.message) } : null },
  })) });
};
queryClient.getQueryCache().subscribe(() => {
  clearTimeout(persisting);
  persisting = setTimeout(persistCache, 300);
});
queryClient.getMutationCache().subscribe((event) => {
  const m = event.mutation;
  if (m && (m.state.isPaused || (m.state.context as { queued?: boolean })?.queued) && !m.meta?.retained) m.setOptions({ ...m.options, gcTime: Infinity, meta: { ...m.meta, retained: true } });
  if (event.type === "updated" && m?.meta?.retained && m.state.status === "success") queryClient.getMutationCache().remove(m);
  persistCache();
});

persistCache();
void queryClient.resumePausedMutations();
if (isLocallySignedOut() && onlineManager.isOnline()) endSession();
onlineManager.subscribe((online) => { if (online && isLocallySignedOut()) endSession(); });

export async function signOutDevice() {
  lockDevice();
  endSession();
  await queryClient.cancelQueries();
  queryClient.getMutationCache().clear();
  queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== "/api/session" });
  queryClient.setQueryData(["/api/session"], { setup: false, user: null });
}
