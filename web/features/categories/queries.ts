import type { QueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { kind } from "../../../shared/schema";
import { refresh } from "../../lib/api";
import { type Category, category, type Request } from "../../lib/schemas";

export function syncCategory(client: QueryClient, data: unknown, [method, , body]: Request) {
  if (method === "DELETE" || (method === "PUT" && z.object({ kind }).safeParse(body).success)) return client.invalidateQueries();
  const order = z.array(z.number()).safeParse(body).data;
  if (order)
    return client.setQueryData<Category[]>(["/api/categories"], (rows) => {
      const slots = order.flatMap((id) => rows?.filter((r) => r.id === id) ?? []);
      return rows?.map((c) => (order.includes(c.id) ? (slots.shift() ?? c) : c));
    });
  const row = category.parse(data);
  refresh(client, "/api/stats");
  return client.setQueryData<Category[]>(["/api/categories"], (rows = []) =>
    rows.some((c) => c.id === row.id) ? rows.map((c) => (c.id === row.id ? row : c)) : [...rows, row],
  );
}
