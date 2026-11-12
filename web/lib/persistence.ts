import { dehydrate, hydrate, type QueryClient } from "@tanstack/react-query";
import { isLocallySignedOut, storeCache } from "./device";
import { addRequestId } from "./outbox";
import { request } from "./schemas";

let persisting: ReturnType<typeof setTimeout>;

export function restoreCache(client: QueryClient) {
  try {
    const cache = JSON.parse(localStorage.getItem("cache") ?? "null");
    if (!cache || isLocallySignedOut()) return;
    const owner =
      cache.owner ??
      cache.queries?.find((q: { queryKey: string[] }) => q.queryKey[0] === "/api/session")?.state.data?.user?.username;
    hydrate(
      client,
      {
        queries: cache.build === import.meta.env.BUILD ? cache.queries : [],
        mutations: (cache.mutations ?? []).map(
          (m: {
            meta?: Record<string, unknown>;
            state: { error?: { message?: string }; status?: string; isPaused?: boolean; variables?: unknown };
          }) => ({
            ...m,
            meta: { owner, ...m.meta, retained: true },
            state: {
              ...m.state,
              variables: addRequestId(request.parse(m.state.variables)),
              ...(m.state.status === "pending" && !m.state.isPaused
                ? { status: "error", error: new Error("Sync was interrupted. Retry to check whether it saved.") }
                : {
                    error: m.state.error
                      ? new Error(m.state.error.message ?? "Couldn’t sync. Check this change and retry.")
                      : null,
                  }),
            },
          }),
        ),
      },
      { defaultOptions: { mutations: { gcTime: Infinity } } },
    );
  } catch {}
}

export function persistCache(client: QueryClient) {
  clearTimeout(persisting);
  if (isLocallySignedOut()) return;
  const cache = dehydrate(client, {
    shouldDehydrateMutation: (m) => !!m.meta?.retained && m.state.status !== "success",
  });
  storeCache({
    build: import.meta.env.BUILD,
    ...cache,
    mutations: cache.mutations.map((m) => ({
      ...m,
      state: { ...m.state, error: m.state.error ? { message: String(m.state.error.message) } : null },
    })),
  });
}

export function persistSoon(client: QueryClient) {
  clearTimeout(persisting);
  persisting = setTimeout(() => persistCache(client), 300);
}
