import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { transactionInput } from "../shared/schema";
import type { Ctx } from "./app";
import { auth, type Env } from "./auth";
import { categoryRoutes, categoryUpdate, newCategory, order, tagInput } from "./categories";
import type { Valuer } from "./rates";
import { recurringRoutes, schedule } from "./recurring";
import { transactionRoutes } from "./transactions";

export function chatActions(ctx: Ctx, value: Valuer, cookie: string) {
  const app = new Hono<Env>();
  app.route("/", auth(ctx.db, ctx.clock));
  app.route("/", transactionRoutes(ctx, value));
  app.route("/", categoryRoutes(ctx.db));
  app.route("/", recurringRoutes(ctx));
  const id = z.object({ id: z.number().int().positive() });
  const empty = z.object({});
  const action = <T extends z.ZodType>(description: string, input: T, method: string, path: (args: z.output<T>) => string, payload: (args: z.output<T>) => unknown = (args) => args) => ({
    description,
    parameters: z.toJSONSchema(input, { io: "input", target: "openapi-3.0" }),
    run: async (raw: unknown) => {
      const args = input.parse(raw);
      const res = await app.request(path(args), {
        method,
        headers: { "content-type": "application/json", cookie },
        body: method === "GET" || method === "DELETE" ? undefined : JSON.stringify(payload(args)),
      });
      if (res.status === 401) throw new HTTPException(401, { message: "Your session ended. Sign in again." });
      const result = await res.json();
      return res.ok ? { outcome: "completed", result } : result;
    },
  });
  return {
    add_transaction: action("Save an expense or income now. Amount is a decimal string in major units. Use an income category for income.", transactionInput, "POST", () => "/api/transactions"),
    update_transaction: action("Replace a transaction. Read its current fields first and preserve fields the user did not change.", transactionInput.extend(id.shape), "PUT", ({ id }) => `/api/transactions/${id}`),
    bin_transaction: action("Move a transaction to the bin.", id, "DELETE", ({ id }) => `/api/transactions/${id}`),
    confirm_transaction: action("Confirm a pending transaction.", id, "POST", ({ id }) => `/api/transactions/${id}/confirm`),
    restore_transaction: action("Restore a binned transaction.", id, "POST", ({ id }) => `/api/bin/${id}/restore`),
    purge_transaction: action("Permanently delete a transaction when explicitly requested.", id, "DELETE", ({ id }) => `/api/transactions/${id}?purge=1`),
    empty_bin: action("Permanently delete all binned transactions when explicitly requested.", empty, "DELETE", () => "/api/bin"),
    add_category: action("Create an expense or income category or subcategory.", newCategory, "POST", () => "/api/categories"),
    update_category: action("Change category fields.", categoryUpdate.extend(id.shape), "PUT", ({ id }) => `/api/categories/${id}`),
    delete_category: action("Delete a category and move its transactions and schedules to moveTo or the built-in category.", id.extend({ moveTo: z.number().int().positive().optional() }), "DELETE", ({ id, moveTo }) => `/api/categories/${id}${moveTo ? `?moveTo=${moveTo}` : ""}`),
    order_categories: action("Set the current user's category order.", z.object({ ids: order }), "PUT", () => "/api/categories/order", ({ ids }) => ids),
    rename_tag: action("Rename a tag.", tagInput.extend(id.shape), "PUT", ({ id }) => `/api/tags/${id}`),
    delete_tag: action("Remove a tag from transactions and schedules.", id, "DELETE", ({ id }) => `/api/tags/${id}`),
    list_recurring: action("List recurring schedules before changing one.", empty, "GET", () => "/api/recurring"),
    add_recurring: action("Create a recurring expense or income schedule. Amount is in major units.", schedule, "POST", () => "/api/recurring"),
    update_recurring: action("Replace a recurring schedule. Read it first and preserve unchanged fields.", schedule.extend(id.shape), "PUT", ({ id }) => `/api/recurring/${id}`),
    pause_recurring: action("Pause a recurring schedule.", id, "POST", ({ id }) => `/api/recurring/${id}/pause`),
    resume_recurring: action("Resume a recurring schedule without backfilling skipped dates.", id, "POST", ({ id }) => `/api/recurring/${id}/resume`),
    delete_recurring: action("Delete a recurring schedule, retaining its transactions.", id, "DELETE", ({ id }) => `/api/recurring/${id}`),
  };
}
