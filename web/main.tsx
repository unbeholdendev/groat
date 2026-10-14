import { createRoot } from "react-dom/client";
import { dehydrate, hydrate, keepPreviousData, MutationCache, onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import "./index.css";
import { routeTree } from "./routeTree.gen";
import type { Chat } from "./routes/chat";
import { type Category, type Draft, type Expense, type Request, send } from "./shared";

const queryClient: QueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: ({ queryKey }) => send("GET", queryKey.join("")),
      placeholderData: keepPreviousData,
      gcTime: 864e5,
      retry: (n, e: Error & { status?: number }) => n < 3 && !(e.status && e.status < 500),
    },
  },
  mutationCache: new MutationCache({ onSuccess: saved }),
});
queryClient.setMutationDefaults(["send"], { mutationFn: (r: Request) => send(...r) });

try {
  hydrate(queryClient, JSON.parse(localStorage.getItem("cache")!));
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
    const chat = data as Chat;
    queryClient.setQueryData([`/api/chats/${chat.id}`], chat);
    return queryClient.setQueryData<Chat[]>(["/api/chats"], (rows) => rows && (rows.some((c) => c.id === chat.id) ? rows : [{ id: chat.id, title: chat.title }, ...rows]));
  }
  const [method, path, body] = variables as Request;
  if (method === "PUT" && path === "/api/categories/order") {
    const ids = body as number[];
    return queryClient.setQueryData<Category[]>(["/api/categories"], (rows) => {
      const slots = ids.map((id) => rows?.find((r) => r.id === id)!);
      return rows?.map((c) => (ids.includes(c.id) ? slots.shift()! : c));
    });
  }
  if (method !== "DELETE" && path.startsWith("/api/categories")) {
    const row = data as Category;
    refresh("/api/stats");
    return queryClient.setQueryData<Category[]>(["/api/categories"], (rows = []) =>
      rows.some((c) => c.id === row.id) ? rows.map((c) => (c.id === row.id ? row : c)) : [...rows, row],
    );
  }
  if (path === "/api/settings" && !("baseCurrency" in (body as object))) return queryClient.setQueryData(["/api/settings"], data);
  if (!/^\/api\/(expenses|bin)\/\d+/.test(path) && !(method === "POST" && path === "/api/expenses"))
    return queryClient.invalidateQueries();
  const row = data as Expense;
  const gone = method === "DELETE";
  for (const [key, rows] of queryClient.getQueriesData<Expense[]>({ queryKey: ["/api/expenses?"] })) {
    if (!rows) continue;
    const { from = "", to = "~", status, ...rest } = Object.fromEntries(new URLSearchParams(key[1] as string));
    const fits = !gone && row.date >= from && row.date <= to && (!status || row.status === status);
    if (Object.keys(rest).length && !gone) queryClient.invalidateQueries({ queryKey: key, exact: true });
    else
      queryClient.setQueryData(
        key,
        [...rows.filter((r) => r.id !== row.id), ...(fits ? [row] : [])].sort(
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
      <p className="mt-2 text-ink2">{(error as Error).message}</p>
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
