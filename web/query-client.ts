import { dehydrate, hydrate, keepPreviousData, MutationCache, onlineManager, QueryCache, QueryClient } from "@tanstack/react-query";
import { send } from "./lib/api";
import type { Request } from "./lib/schemas";
import { patchCache } from "./cache-sync";

export const queryClient: QueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      placeholderData: keepPreviousData,
      gcTime: 864e5,
      retry: (n, e: Error & { status?: number }) => n < 3 && !(e.status && e.status < 500),
    },
  },
  queryCache: new QueryCache({ onError: signedOut }),
  mutationCache: new MutationCache({ onSuccess: (data, variables, _, mutation) => patchCache(queryClient, data, variables, mutation), onError: signedOut }),
});
function signedOut(e: Error & { status?: number }) {
  if (e.status === 401) queryClient.invalidateQueries({ queryKey: ["/api/session"] });
}
queryClient.setMutationDefaults(["send"], { mutationFn: (r: Request) => send(...r) });

try {
  hydrate(queryClient, JSON.parse(localStorage.getItem("cache") ?? "null"));
} catch {}
onlineManager.setOnline(navigator.onLine);
queryClient.resumePausedMutations();
let persisting: ReturnType<typeof setTimeout>;
const save = () => {
  clearTimeout(persisting);
  try {
    localStorage.setItem("cache", JSON.stringify(dehydrate(queryClient)));
  } catch {}
};
queryClient.getQueryCache().subscribe(() => {
  clearTimeout(persisting);
  persisting = setTimeout(save, 300);
});
// A resumed add must stop being stored as paused at once, or a reload replays it.
queryClient.getMutationCache().subscribe(save);
