import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type { Resource } from "../../shared/schema";

const keys: Record<Resource, string[]> = {
  transactions: ["/api/transactions?", "/api/bin", "/api/tags", "/api/notes", "/api/stats", "/api/settings"],
  categories: ["/api/categories", "/api/stats"],
  settings: ["/api/settings"],
  recurring: ["/api/recurring"],
  members: ["/api/users"],
  tokens: ["/api/tokens"],
  ai: ["/api/ai", "/api/models", "/api/chatgpt"],
  session: ["/api/session"],
  chats: ["/api/chats"],
};

export const stale = (key: QueryKey, resources: readonly Resource[], patched: string[] = []) => {
  const path = String(key[0]);
  const under = (prefix: string) => path.startsWith(prefix);
  return resources.some((r) => keys[r].some(under)) && !patched.includes(path);
};

export const invalidate = (client: QueryClient, resources: readonly Resource[], patched?: string[]) =>
  client.invalidateQueries({ predicate: (q) => stale(q.queryKey, resources, patched) });
