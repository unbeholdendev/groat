import type { QueryClient } from "@tanstack/react-query";
import { refresh } from "../../lib/api";
import { aiProvider, type ApiToken, apiToken, models, type Request, settings } from "../../lib/schemas";

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

export function syncAi(client: QueryClient, data: unknown) {
  client.setQueryData(["/api/ai"], aiProvider.parse(data));
  return Promise.all([refresh(client, "/api/models"), refresh(client, "/api/settings")]);
}

export const syncChatgpt = (client: QueryClient) => Promise.all([refresh(client, "/api/chatgpt"), refresh(client, "/api/models"), refresh(client, "/api/settings")]);

export function syncModels(client: QueryClient, data: unknown) {
  client.setQueryData(["/api/models"], models.parse(data));
  return refresh(client, "/api/settings");
}
