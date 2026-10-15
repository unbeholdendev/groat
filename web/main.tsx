import { createRoot } from "react-dom/client";
import { dehydrate, hydrate, keepPreviousData, MutationCache, onlineManager, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import "./index.css";
import { routeTree } from "./routeTree.gen";
import { type ApiToken, apiToken, type Category, type Chat, category, chat, type Draft, type Expense, expense, request, type Request, send } from "./api";
import { z } from "zod";

const queryClient: QueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      placeholderData: keepPreviousData,
      gcTime: 864e5,
      retry: (n, e: Error & { status?: number }) => n < 3 && !(e.status && e.status < 500),
    },
  },
  queryCache: new QueryCache({ onError: signedOut }),
  mutationCache: new MutationCache({ onSuccess: saved, onError: signedOut }),
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
const persist = () => {
  clearTimeout(persisting);
  persisting = setTimeout(() => {
    try {
      localStorage.setItem("cache", JSON.stringify(dehydrate(queryClient)));
    } catch {}
  }, 300);
};
queryClient.getQueryCache().subscribe(persist);
queryClient.getMutationCache().subscribe(persist);

function saved(data: unknown, variables: unknown) {
  if (typeof variables === "number") return queryClient.setQueryData<Chat[]>(["/api/chats"], (rows) => rows?.filter((c) => c.id !== variables));
  if (!Array.isArray(variables)) {
    const c = chat.parse(data);
    queryClient.setQueryData([`/api/chats/${c.id}`], c);
    return queryClient.setQueryData<Chat[]>(["/api/chats"], (rows) => rows && (rows.some((r) => r.id === c.id) ? rows : [{ id: c.id, title: c.title }, ...rows]));
  }
  const [method, path, body] = request.parse(variables);
  if (method === "PUT" && path === "/api/categories/order") {
    const ids = z.array(z.number()).parse(body);
    return queryClient.setQueryData<Category[]>(["/api/categories"], (rows) => {
      const slots = ids.flatMap((id) => rows?.filter((r) => r.id === id) ?? []);
      return rows?.map((c) => (ids.includes(c.id) ? (slots.shift() ?? c) : c));
    });
  }
  if (method !== "DELETE" && path.startsWith("/api/categories")) {
    const row = category.parse(data);
    refresh("/api/stats");
    return queryClient.setQueryData<Category[]>(["/api/categories"], (rows = []) =>
      rows.some((c) => c.id === row.id) ? rows.map((c) => (c.id === row.id ? row : c)) : [...rows, row],
    );
  }
  if (path.startsWith("/api/tokens")) {
    const row = apiToken.parse(data);
    return queryClient.setQueryData<ApiToken[]>(["/api/tokens"], (rows = []) => (method === "DELETE" ? rows.filter((r) => r.id !== row.id) : [row, ...rows]));
  }
  if (path === "/api/settings" && !z.object({ baseCurrency: z.string() }).safeParse(body).success) return queryClient.setQueryData(["/api/settings"], data);
  if (path.startsWith("/api/users")) return refresh("/api/users");
  if (!/^\/api\/(expenses|bin)\/\d+/.test(path) && !(method === "POST" && path === "/api/expenses"))
    return queryClient.invalidateQueries();
  const gone = method === "DELETE";
  const { id } = z.object({ id: z.number() }).parse(data);
  const row = gone ? undefined : expense.parse(data);
  for (const [key, rows] of queryClient.getQueriesData<Expense[]>({ queryKey: ["/api/expenses?"] })) {
    if (!rows) continue;
    const { from = "", to = "~", status, ...rest } = Object.fromEntries(new URLSearchParams(String(key[1])));
    const fits = row && row.date >= from && row.date <= to && (!status || row.status === status);
    if (Object.keys(rest).length && row) queryClient.invalidateQueries({ queryKey: key, exact: true });
    else
      queryClient.setQueryData(
        key,
        [...rows.filter((r) => r.id !== id), ...(row && fits ? [row] : [])].sort(
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
  defaultErrorComponent: ({ error }) => (
    <div className="py-10">
      <h1 className="text-display font-bold">This didn’t load</h1>
      <p className="mt-2 text-ink2">{error instanceof Error ? error.message : String(error)}</p>
      <button className="quiet mt-5" onClick={() => location.reload()}>
        Try again
      </button>
    </div>
  ),
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
