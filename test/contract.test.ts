import { expect, test } from "bun:test";
import { z } from "zod";
import { apiToken, category, chat, expense, member, period, session, settings, suggestion, tag, template } from "../web/lib/schemas";
import { setup } from "./harness";

test("web schemas accept what the server sends", async () => {
  const ai = { aiBaseUrl: "https://ai.test/v1", aiApiKey: "k", aiModel: "m" };
  const reply = { choices: [{ message: { role: "assistant", content: "hi" } }] };
  const { call } = setup(undefined, (url) => (url.host === "ai.test" ? Response.json(reply) : undefined), ai);
  await call("POST", "/api/onboarding", { baseCurrency: "GBP" });
  const food = (await call("POST", "/api/categories", { name: "Food", icon: "x", color: "#f00" })).body;
  const row = (await call("POST", "/api/expenses", { note: "milk", amount: "1.20", tags: ["a"], categoryId: food.id })).body;
  await call("POST", "/api/recurring", { note: "rent", amount: "5", period: "month", every: 1 });
  const binned = (await call("DELETE", `/api/expenses/${row.id}`)).body;
  const c = (await call("POST", "/api/chats", { message: "hi" })).body;
  const checks: [z.ZodType, unknown][] = [
    [category, food],
    [expense, row],
    [expense, binned],
    [chat, c],
    [z.array(chat), (await call("GET", "/api/chats")).body],
    [session, (await call("GET", "/api/session")).body],
    [z.array(member), (await call("GET", "/api/users")).body],
    [settings, (await call("GET", "/api/settings")).body],
    [z.array(category), (await call("GET", "/api/categories")).body],
    [z.array(expense), (await call("GET", "/api/expenses")).body],
    [z.array(expense), (await call("GET", "/api/bin")).body],
    [z.array(template), (await call("GET", "/api/recurring")).body],
    [z.array(tag), (await call("GET", "/api/tags")).body],
    [z.array(suggestion), (await call("GET", "/api/notes?prefix=r")).body],
    [period, (await call("GET", "/api/stats?from=2026-10-01&to=2026-10-10")).body],
    [apiToken, (await call("POST", "/api/tokens", { name: "Phone" })).body],
    [z.array(apiToken), (await call("GET", "/api/tokens")).body],
  ];
  for (const [schema, body] of checks) expect(schema.safeParse(body).error).toBeUndefined();
});
