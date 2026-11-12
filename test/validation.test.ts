import { expect, test } from "bun:test";
import { models, setup } from "./harness";

const ai = { baseUrl: "https://ai.test/v1", key: "sk-test" };
const listed = models(["test-model"]);

test("malformed input gets a readable 400 on every route family", async () => {
  const { call, request } = setup(undefined, listed, ai);
  const category = (await call("POST", "/api/categories", { name: "Food", icon: "🍽️", color: "#f00" })).body.id;
  const cases: [string, string, unknown, string][] = [
    ["POST", "/api/transactions", { note: "x", amount: 5 }, "Invalid amount"],
    ["GET", "/api/transactions?from=yesterday", undefined, "Invalid date"],
    ["GET", "/api/export?category=abc", undefined, "Invalid category"],
    ["POST", "/api/categories", { name: " ", icon: "x", color: "#f00" }, "Enter a name, emoji and colour"],
    ["PUT", "/api/categories/order", { ids: [1] }, "Expected a list of category IDs"],
    ["PUT", "/api/categories/order", [1, "2"], "Expected a list of category IDs"],
    ["POST", "/api/transactions", { note: "x", amount: "5", tags: ["ok", " "] }, "Invalid tags"],
    ["DELETE", `/api/categories/${category}?moveTo=abc`, undefined, "Invalid category to move to"],
    ["PUT", "/api/tags/1", { name: 3 }, "Enter a name"],
    ["POST", "/api/recurring", { note: "rent", amount: "5", period: "fortnight", every: 1 }, "Invalid schedule"],
    ["PUT", "/api/settings", { theme: "neon" }, "Invalid theme"],
    ["POST", "/api/onboarding", { baseCurrency: "NOPE" }, "Invalid currency"],
    ["GET", "/api/stats?from=2026-10-10&to=2026-10-01", undefined, "Invalid date range"],
    ["POST", "/api/chats", { message: 4 }, "Enter a message"],
  ];
  for (const [method, path, body, error] of cases)
    expect([method, path, await call(method, path, body)]).toEqual([method, path, { status: 400, body: { error } }]);

  const res = await request("/api/transactions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{not json",
  });
  expect([res.status, await res.json()]).toEqual([400, { error: "Invalid request" }]);
});

test("an unexpected AI provider reply is a clear error, not a crash", async () => {
  const { call } = setup(
    undefined,
    (url) => listed(url) ?? (url.host === "ai.test" ? Response.json({ choices: [] }) : undefined),
    ai,
  );
  expect((await call("POST", "/api/chats", { message: "hi" })).body.messages.at(-1)).toEqual({
    role: "assistant",
    content: "The AI provider sent an unexpected reply",
  });
});
