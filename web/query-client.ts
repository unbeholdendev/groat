import { dehydrate, hydrate, keepPreviousData, MutationCache, onlineManager, QueryCache, QueryClient } from "@tanstack/react-query";
import { refresh, send } from "./lib/api";
import type { Request } from "./lib/schemas";
import { syncCategory } from "./features/categories/queries";
import { syncExpense } from "./features/expenses/queries";
import { syncSettings, syncToken, syncUsers } from "./features/settings/queries";

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
  if (e.status === 401) queryClient.invalidateQueries({ queryKey: ["/api/session"] });
}
// In mutationFn, not onSuccess: a hook's onSuccess replaces the default, and only defaults survive a reload.
const sync = (key: string[], patch: (client: QueryClient, data: unknown, request: Request) => unknown) =>
  queryClient.setMutationDefaults(key, {
    mutationFn: async (r: Request, { client }) => {
      const data = await send(...r);
      await patch(client, data, r);
      return data;
    },
  });
sync(["send"], (client) => client.invalidateQueries());
sync(["send", "bin"], (client) => refresh(client, "/api/bin"));
sync(["send", "expense"], syncExpense);
sync(["send", "category"], syncCategory);
sync(["send", "settings"], syncSettings);
sync(["send", "token"], syncToken);
sync(["send", "users"], syncUsers);

try {
  const cache = JSON.parse(localStorage.getItem("cache") ?? "null");
  // Another build's queries may not fit its schemas; queued adds must survive.
  hydrate(queryClient, cache?.build === import.meta.env.BUILD ? cache : { mutations: cache?.mutations ?? [], queries: [] });
} catch {}
onlineManager.setOnline(navigator.onLine);
queryClient.resumePausedMutations();
let persisting: ReturnType<typeof setTimeout>;
const save = () => {
  clearTimeout(persisting);
  try {
    localStorage.setItem("cache", JSON.stringify({ build: import.meta.env.BUILD, ...dehydrate(queryClient) }));
  } catch {}
};
queryClient.getQueryCache().subscribe(() => {
  clearTimeout(persisting);
  persisting = setTimeout(save, 300);
});
// A resumed add must stop being stored as paused at once, or a reload replays it.
queryClient.getMutationCache().subscribe(save);
