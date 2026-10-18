import type { QueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { refresh } from "../../lib/api";
import { type ApiToken, apiToken, type Request } from "../../lib/schemas";

export const syncSettings = (client: QueryClient, data: unknown, [, , body]: Request) =>
  z.object({ baseCurrency: z.string() }).safeParse(body).success ? client.invalidateQueries() : client.setQueryData(["/api/settings"], data);

export function syncToken(client: QueryClient, data: unknown, [method]: Request) {
  const row = apiToken.parse(data);
  client.setQueryData<ApiToken[]>(["/api/tokens"], (rows = []) => (method === "DELETE" ? rows.filter((r) => r.id !== row.id) : [row, ...rows]));
}

export const syncUsers = (client: QueryClient) => refresh(client, "/api/users");
