import type { QueryClient } from "@tanstack/react-query";
import { invalidate } from "../../lib/resources";
import { aiProvider, type ApiToken, apiToken, models, type Request, settings } from "../../lib/schemas";

export function syncSettings(client: QueryClient, data: unknown, [, path]: Request) {
  const next = settings.parse(data);
  const rebased = settings.safeParse(client.getQueryData(["/api/settings"])).data?.baseCurrency !== next.baseCurrency;
  client.setQueryData(["/api/settings"], next);
  if (path === "/api/onboarding") return invalidate(client, ["categories", "transactions"], ["/api/settings"]);
  if (rebased) return invalidate(client, ["transactions"], ["/api/settings"]);
}

export function syncToken(client: QueryClient, data: unknown, [method]: Request) {
  const row = apiToken.parse(data);
  client.setQueryData<ApiToken[]>(["/api/tokens"], (rows = []) => (method === "DELETE" ? rows.filter((r) => r.id !== row.id) : [row, ...rows]));
}

export const syncUsers = (client: QueryClient) => invalidate(client, ["members"]);

export function syncAi(client: QueryClient, data: unknown) {
  client.setQueryData(["/api/ai"], aiProvider.parse(data));
  return invalidate(client, ["ai"], ["/api/ai"]);
}

export const syncChatgpt = (client: QueryClient) => invalidate(client, ["ai"]);

export function syncModels(client: QueryClient, data: unknown) {
  client.setQueryData(["/api/models"], models.parse(data));
  return invalidate(client, ["ai"], ["/api/models"]);
}
