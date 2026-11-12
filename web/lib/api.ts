import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { aiStatus, category, type Request, session, settings } from "./schemas";

import { isLocallySignedOut } from "./device";

const failure = z.object({ error: z.string() }).partial();

export const tab = Math.random().toString(36).slice(2);

export async function send(method: string, path: string, body?: unknown, owner?: string): Promise<unknown> {
  const init =
    body instanceof FormData
      ? { headers: { "x-tab": tab }, body }
      : {
          headers: {
            "content-type": "application/json",
            "x-tab": tab,
            ...(owner ? { "x-transaction-user": encodeURIComponent(owner) } : {}),
          },
          body: JSON.stringify(body),
        };
  const res = await fetch(path, { method, ...init }).catch(() => {
    throw new Error("Couldn’t reach the server. Check your connection and try again.");
  });
  const json: unknown = await res.json().catch(() => ({}));
  if (!res.ok)
    throw Object.assign(
      new Error(failure.catch({}).parse(json).error ?? `Something went wrong (${res.status}). Try again.`),
      { status: res.status },
    );
  return json;
}
export const useSend = (key?: string, onSuccess?: () => void) => {
  const client = useQueryClient();
  const owner = session.safeParse(client.getQueryData(["/api/session"])).data?.user?.username;
  return useMutation<unknown, Error, Request>({ mutationKey: ["send", key], meta: { owner }, onSuccess });
};

export const useApi = <T extends z.ZodType>(
  schema: T,
  queryKey: string[],
  options: { enabled?: boolean; throwOnError?: boolean } = {},
) =>
  useQuery({
    queryKey,
    queryFn: async () =>
      schema.parse(
        queryKey[0] === "/api/session" && isLocallySignedOut()
          ? { setup: false, user: null }
          : await send("GET", queryKey.join("")),
      ),
    ...options,
  });

export const useSettings = () => {
  const config = useApi(settings, ["/api/settings"]);
  const status = useApi(aiStatus, ["/api/ai/status"], { enabled: !!config.data?.onboarded });
  return (
    config.data && {
      ...config.data,
      ...(status.data ?? {
        ai: false,
        aiSource: null,
        aiProblem: status.error?.message ?? null,
        vision: false,
        voice: false,
      }),
      aiLoading: !status.data && !status.isError,
    }
  );
};
export const useSession = () => useApi(session, ["/api/session"]).data;
export const useCategories = () => useApi(z.array(category), ["/api/categories"]).data ?? [];
// Paused mutations are persisted to localStorage; never let a password queue offline.
export const useSendNow = (key?: string) => {
  const client = useQueryClient();
  const owner = session.safeParse(client.getQueryData(["/api/session"])).data?.user?.username;
  return useMutation<unknown, Error, Request>({
    mutationKey: ["send", key],
    meta: { owner, transient: true },
    networkMode: "always",
  });
};
