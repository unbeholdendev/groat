import { expect, test } from "bun:test";
import { draft } from "../web/api";
import { setup } from "./harness";

const config = { aiBaseUrl: "https://ai.test/v1", aiApiKey: "sk-test", aiModel: "test-model" };

function provider(read: (body: any) => unknown) {
  const requests: any[] = [];
  const handler = (url: URL, init?: RequestInit) => {
    if (url.href !== "https://ai.test/v1/chat/completions") return;
    const body = JSON.parse(String(init?.body));
    requests.push(body);
    const args = read(body);
    return Response.json({
      choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "c", type: "function", function: { name: "expense", arguments: typeof args === "string" ? args : JSON.stringify(args) } }] } }],
    });
  };
  return { handler, requests };
}

test("text becomes a draft with a category from the household's list, saving nothing", async () => {
  const ai = provider((body) => {
    const food = JSON.parse(body.messages[0].content.match(/Categories: (.*)/)[1]).find((c: { name: string }) => c.name === "Food");
    return { note: "Lunch with Sam", amount: "18.40", date: "2026-10-09", categoryId: food.id, tags: ["friends"] };
  });
  const { call } = setup(undefined, ai.handler, config);
  await call("POST", "/api/onboarding", { baseCurrency: "GBP", currencies: ["GBP"] });
  const food = (await call("GET", "/api/categories")).body.find((c: { name: string }) => c.name === "Food");

  const res = await call("POST", "/api/drafts", { text: "lunch with sam yesterday eighteen forty #work" });
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ note: "Lunch with Sam", amount: 1840, currency: "GBP", date: "2026-10-09", categoryId: food.id, tags: ["work", "friends"] });
  expect(draft.safeParse(res.body).error).toBeUndefined();
  expect(ai.requests[0].tool_choice).toEqual({ type: "function", function: { name: "expense" } });
  expect((await call("GET", "/api/expenses")).body).toEqual([]);
});

test("an unknown category, currency or future date falls back instead of failing", async () => {
  const ai = provider(() => ({ note: "Thing", categoryId: 9999, currency: "XYZ", date: "2099-01-01" }));
  const { call } = setup(undefined, ai.handler, config);
  const uncategorised = (await call("GET", "/api/categories")).body.find((c: { builtin: boolean }) => c.builtin);
  const res = await call("POST", "/api/drafts", { text: "thing" });
  expect(res.body).toMatchObject({ note: "Thing", amount: 0, date: "2026-10-10", categoryId: uncategorised.id });
});

test("drafts are refused with AI off, and a bad reply is a 502", async () => {
  expect((await setup().call("POST", "/api/drafts", { text: "coffee" })).status).toBe(403);
  const { call } = setup(undefined, provider(() => "not json").handler, config);
  expect((await call("POST", "/api/drafts", { text: "coffee" })).status).toBe(502);
  expect((await call("POST", "/api/drafts", { text: " " })).status).toBe(400);
});

test("capture with unsure text saves the AI's read as pending; sure text skips the AI", async () => {
  const ai = provider(() => ({ note: "Parking", amount: "6", categoryId: 1 }));
  const h = setup(undefined, ai.handler, config);
  const food = (await h.call("POST", "/api/categories", { name: "Snacks", icon: "x", color: "#f00" })).body;
  await h.call("POST", "/api/expenses", { note: "Crisps", amount: "1", categoryId: food.id });
  const { token } = (await h.call("POST", "/api/tokens", { name: "Phone" })).body;
  const capture = async (text: string) =>
    (await h.app.request("/api/capture", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ text }) })).json();

  expect(await capture("parked the car six quid")).toMatchObject({ note: "Parking", amount: 600, categoryId: 1, status: "pending", addedBy: "admin" });
  expect(await capture("crisps 2")).toMatchObject({ note: "crisps", amount: 200, categoryId: food.id, status: "normal" });
  expect(ai.requests).toHaveLength(1);
});
