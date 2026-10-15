import { expect, test } from "bun:test";
import { setup } from "./harness";

const ai = { aiBaseUrl: "https://ai.test/v1", aiApiKey: "sk-test", aiModel: "test-model" };

test("malformed input gets a readable 400 on every route family", async () => {
  const { call, request } = setup(undefined, undefined, ai);
  const category = (await call("POST", "/api/categories", { name: "Food", icon: "🍽️", color: "#f00" })).body.id;
  const cases: [string, string, unknown, string][] = [
    ["POST", "/api/expenses", { note: "x", amount: 5 }, "invalid amount"],
    ["GET", "/api/expenses?from=yesterday", undefined, "invalid date"],
    ["GET", "/api/export?category=abc", undefined, "invalid category"],
    ["POST", "/api/categories", { name: " ", icon: "x", color: "#f00" }, "name, icon and colour are required"],
    ["PUT", "/api/categories/order", { ids: [1] }, "expected a list of ids"],
    ["PUT", "/api/categories/order", [1, "2"], "expected a list of ids"],
    ["POST", "/api/expenses", { note: "x", amount: "5", tags: ["ok", " "] }, "invalid tags"],
    ["DELETE", `/api/categories/${category}?moveTo=abc`, undefined, "invalid moveTo"],
    ["PUT", "/api/tags/1", { name: 3 }, "name is required"],
    ["POST", "/api/recurring", { note: "rent", amount: "5", period: "fortnight", every: 1 }, "invalid schedule"],
    ["PUT", "/api/settings", { theme: "neon" }, "invalid theme"],
    ["POST", "/api/onboarding", { baseCurrency: "NOPE", currencies: [] }, "invalid currencies"],
    ["PUT", "/api/rates", { date: "2026-10-01", currency: "EUR", rate: 1.2 }, "invalid rate"],
    ["GET", "/api/stats?from=2026-10-10&to=2026-10-01", undefined, "invalid range"],
    ["POST", "/api/chats", { message: 4 }, "message is required"],
  ];
  for (const [method, path, body, error] of cases) expect([method, path, await call(method, path, body)]).toEqual([method, path, { status: 400, body: { error } }]);

  const res = await request("/api/expenses", { method: "POST", headers: { "content-type": "application/json" }, body: "{not json" });
  expect([res.status, await res.json()]).toEqual([400, { error: "invalid request" }]);
});

test("an unexpected AI provider reply is a clear error, not a crash", async () => {
  const { call } = setup(undefined, (url) => (url.host === "ai.test" ? Response.json({ choices: [] }) : undefined), ai);
  expect(await call("POST", "/api/chats", { message: "hi" })).toEqual({ status: 502, body: { error: "AI provider sent an unexpected reply" } });
});
