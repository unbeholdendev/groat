import type { Mutation, QueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { type ApiToken, apiToken, type Category, category, type Chat, chat, type Expense, expense, request } from "./lib/schemas";

export function patchCache(queryClient: QueryClient, data: unknown, variables: unknown, mutation: Mutation<unknown, unknown, unknown>) {
  const refresh = (prefix: string) => queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith(prefix) });
  if (typeof variables === "number") return queryClient.setQueryData<Chat[]>(["/api/chats"], (rows) => rows?.filter((c) => c.id !== variables));
  if (mutation.options.mutationKey?.[0] === "ask") {
    const c = chat.parse(data);
    queryClient.setQueryData([`/api/chats/${c.id}`], c);
    return queryClient.setQueryData<Chat[]>(["/api/chats"], (rows) => rows && (rows.some((r) => r.id === c.id) ? rows : [{ id: c.id, title: c.title }, ...rows]));
  }
  if (!Array.isArray(variables)) return;
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
