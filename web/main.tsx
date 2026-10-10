import { createRoot } from "react-dom/client";
import { keepPreviousData, MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import "./index.css";
import { routeTree } from "./routeTree.gen";
import type { Draft, Expense, Request } from "./shared";

const queryClient: QueryClient = new QueryClient({
  defaultOptions: {
    queries: { queryFn: ({ queryKey }) => fetch(queryKey.join("")).then((r) => r.json()), placeholderData: keepPreviousData },
  },
  mutationCache: new MutationCache({ onSuccess: saved }),
});

function saved(data: unknown, variables: unknown) {
  if (!Array.isArray(variables)) return refresh("/api/chats");
  const [method, path] = variables as Request;
  if (!/^\/api\/(expenses|bin)\/\d+/.test(path) && !(method === "POST" && path === "/api/expenses"))
    return queryClient.invalidateQueries();
  const row = data as Expense;
  const gone = method === "DELETE";
  for (const [key, rows] of queryClient.getQueriesData<Expense[]>({ queryKey: ["/api/expenses?"] })) {
    if (!rows) continue;
    if (key[1] && !gone) queryClient.invalidateQueries({ queryKey: key, exact: true });
    else
      queryClient.setQueryData(
        key,
        [...rows.filter((r) => r.id !== row.id), ...(gone ? [] : [row])].sort(
          (a, b) => b.date.localeCompare(a.date) || b.id - a.id,
        ),
      );
  }
  ["/api/settings", "/api/tags", "/api/notes", "/api/bin", "/api/stats"].forEach(refresh);
}

const refresh = (prefix: string) =>
  queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith(prefix) });

const router = createRouter({
  routeTree,
  parseSearch: (s) => Object.fromEntries(new URLSearchParams(s)),
  stringifySearch: (s) => {
    const q = new URLSearchParams(Object.entries(s).filter(([, v]) => v)).toString();
    return q && `?${q}`;
  },
});
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
  interface HistoryState {
    draft?: Draft;
  }
}

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
);
navigator.serviceWorker?.register("/sw.js");
