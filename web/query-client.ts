import { keepPreviousData, MutationCache, onlineManager, QueryCache, QueryClient } from "@tanstack/react-query";
import { invalidate } from "./lib/resources";
import { liveUpdates } from "./lib/live";
import { retain, sync } from "./lib/outbox";
import { persistCache, persistSoon, restoreCache } from "./lib/persistence";
import { clearDevice, endSessionWhenOnline } from "./lib/session";
import { syncCategory } from "./features/categories/queries";
import { syncTransaction } from "./features/transactions/queries";
import { syncAi, syncChatgpt, syncModels, syncSettings, syncToken, syncUsers } from "./features/settings/queries";

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

sync(queryClient, ["send"], () => undefined);
sync(queryClient, ["send", "bin"], (client) => client.setQueryData(["/api/bin"], []));
sync(queryClient, ["send", "recurring"], (client) => invalidate(client, ["recurring", "transactions"]));
sync(queryClient, ["send", "tags"], (client) => invalidate(client, ["transactions", "recurring"]));
sync(queryClient, ["send", "transaction"], syncTransaction);
sync(queryClient, ["send", "category"], syncCategory);
sync(queryClient, ["send", "settings"], syncSettings);
sync(queryClient, ["send", "token"], syncToken);
sync(queryClient, ["send", "users"], syncUsers);
sync(queryClient, ["send", "models"], syncModels);
sync(queryClient, ["send", "ai"], syncAi);
sync(queryClient, ["send", "chatgpt"], syncChatgpt);

// Order matters: restored mutations need their defaults, and nothing may persist or resume before the restore.
restoreCache(queryClient);
onlineManager.setOnline(navigator.onLine);
queryClient.getQueryCache().subscribe(() => persistSoon(queryClient));
queryClient.getMutationCache().subscribe((event) => {
  retain(queryClient, event);
  persistCache(queryClient);
});
persistCache(queryClient);
void queryClient.resumePausedMutations();
endSessionWhenOnline();
liveUpdates(queryClient, () => {
  void clearDevice(queryClient, true).then(() => persistCache(queryClient));
});
