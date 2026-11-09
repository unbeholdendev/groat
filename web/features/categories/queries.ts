import type { QueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { kind } from "../../../shared/schema";
import { invalidate } from "../../lib/resources";
import { type Category, category, type Request } from "../../lib/schemas";

export function syncCategory(client: QueryClient, data: unknown, [method, , body]: Request) {
  if (method === "DELETE") return invalidate(client, ["categories", "transactions", "recurring"]);
  if (method === "PUT" && z.object({ kind }).safeParse(body).success) return invalidate(client, ["categories", "transactions"]);
  const order = z.array(z.number()).safeParse(body).data;
  if (order)
    return client.setQueryData<Category[]>(["/api/categories"], (rows) => {
      const slots = order.flatMap((id) => rows?.filter((r) => r.id === id) ?? []);
      return rows?.map((c) => (order.includes(c.id) ? (slots.shift() ?? c) : c));
    });
  const row = category.parse(data);
  client.setQueryData<Category[]>(["/api/categories"], (rows = []) =>
    rows.some((c) => c.id === row.id) ? rows.map((c) => (c.id === row.id ? row : c)) : [...rows, row],
  );
  void invalidate(client, ["categories"], ["/api/categories"]);
}
