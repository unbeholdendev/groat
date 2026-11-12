import { Hono } from "hono";
import { z } from "zod";
import { admin, type Env } from "../auth/access";
import type { Ctx } from "../context";
import { body } from "../request";
import { chooseModels, configureProvider, modelChoices, providerSummary } from "./provider-settings";

const model = z.string("Pick a model").min(1, "Pick a model");
const choice = z
  .object({ chat: model, vision: model, stt: model })
  .partial()
  .refine((c) => Object.keys(c).length, "Pick a model");

const url = z
  .string("Enter the base URL")
  .trim()
  .transform((s) => s.replace(/\/+$/, ""))
  .pipe(
    z.union([z.literal(""), z.url({ protocol: /^https?$/, error: "Enter a URL starting with http:// or https://" })]),
  );
const secret = z.string("Invalid key").trim().optional();
const providerInput = z.object({ baseUrl: url, key: secret, sttBaseUrl: url.default(""), sttKey: secret });

export function modelRoutes(ctx: Pick<Ctx, "db" | "ai" | "fetch">) {
  const routes = new Hono<Env>();

  routes.use("/api/models", admin);
  routes.use("/api/ai", admin);

  routes.get("/api/models", async (c) => c.json(await modelChoices(ctx)));

  routes.put("/api/models", async (c) => {
    const input = await body(c, choice);
    if ("error" in input) return c.json(input, 400);
    const result = await chooseModels(ctx, input.data);
    if ("error" in result) return c.json({ error: result.error }, result.status);
    return c.json(result.choices);
  });

  routes.get("/api/ai/status", async (c) => c.json(await ctx.ai.status()));

  routes.get("/api/ai", (c) => c.json(providerSummary(ctx)));

  routes.put("/api/ai", async (c) => {
    const input = await body(c, providerInput);
    if ("error" in input) return c.json(input, 400);
    const result = await configureProvider(ctx, input.data);
    return "error" in result ? c.json(result, 400) : c.json(result);
  });

  routes.onError((e, c) => c.json({ error: e.message }, 502));

  return routes;
}
