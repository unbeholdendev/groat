import { type QueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { category, type Request, session, settings } from "./schemas";

const failure = z.object({ error: z.string() }).partial();

export async function send(...[method, path, body]: Request): Promise<unknown> {
  const init = body instanceof FormData ? { body } : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
  const res = await fetch(path, { method, ...init }).catch(() => {
    throw new Error("Couldn’t reach the server. Check your connection and try again.");
  });
  const json: unknown = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(failure.catch({}).parse(json).error ?? `Something went wrong (${res.status}). Try again.`), { status: res.status });
  return json;
}
export const useSend = (key?: string, onSuccess?: () => void) => useMutation<unknown, Error, Request>({ mutationKey: ["send", key], onSuccess });
export const refresh = (client: QueryClient, prefix: string) => client.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith(prefix) });

export const useApi = <T extends z.ZodType>(schema: T, queryKey: string[], options: { enabled?: boolean; throwOnError?: boolean } = {}) =>
  useQuery({ queryKey, queryFn: async () => schema.parse(await send("GET", queryKey.join(""))), ...options });

export const useSettings = () => useApi(settings, ["/api/settings"]).data;
export const useSession = () => useApi(session, ["/api/session"]).data;
export const useCategories = () => useApi(z.array(category), ["/api/categories"]).data ?? [];
// Paused mutations are persisted to localStorage; never let a password queue offline.
export const useSendNow = (key?: string) => useMutation<unknown, Error, Request>({ mutationKey: ["send", key], networkMode: "always" });
