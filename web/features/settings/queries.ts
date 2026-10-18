import type { QueryClient } from "@tanstack/react-query";
import { refresh } from "../../lib/api";
import { type ApiToken, apiToken, type Request, settings } from "../../lib/schemas";

export function syncSettings(client: QueryClient, data: unknown) {
  const next = settings.parse(data);
  if (settings.safeParse(client.getQueryData(["/api/settings"])).data?.baseCurrency !== next.baseCurrency) return client.invalidateQueries();
  client.setQueryData(["/api/settings"], next);
}

export function syncToken(client: QueryClient, data: unknown, [method]: Request) {
  const row = apiToken.parse(data);
  client.setQueryData<ApiToken[]>(["/api/tokens"], (rows = []) => (method === "DELETE" ? rows.filter((r) => r.id !== row.id) : [row, ...rows]));
}

export const syncUsers = (client: QueryClient) => refresh(client, "/api/users");
