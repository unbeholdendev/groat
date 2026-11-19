import { expect, test } from "bun:test";
import { completion, models, setup } from "./harness";

const config = { baseUrl: "https://ai.test/v1", key: "sk-test" };
const listed = models(["test-model"]);

function provider(script: (Record<string, unknown> | number)[] = []) {
  const requests: any[] = [];
  const handler = (url: URL, init?: RequestInit) => {
    if (url.href !== "https://ai.test/v1/chat/completions") return listed(url);
    requests.push(JSON.parse(String(init?.body)));
    const next = script.shift() ?? { content: "NOTHING" };
    if (typeof next === "number") return new Response("{}", { status: next });
    return completion({ role: "assistant", content: null, ...next });
  };
  return { handler, requests, script };
}

const report = "**Coffee** went from 3.20 to 4.10 since March. [See coffee](/?q=coffee&from=2026-03-01&to=2026-10-10)";

test("checking now posts a notable report as an unread chat", async () => {
  const ai = provider([{ content: report }]);
  const s = setup("2026-10-10T12:00:00Z", ai.handler, config);
  expect((await s.call("POST", "/api/check-in")).status).toBe(200);
  const [chat] = (await s.call("GET", "/api/chats")).body;
  expect(chat).toMatchObject({ title: "Check-in 10 Oct", unread: true });
  expect((await s.call("GET", `/api/chats/${chat.id}`)).body.messages).toEqual([
    { role: "assistant", content: report },
  ]);
});

test("a check-in with nothing notable posts no chat but resets the clock", async () => {
  const s = setup("2026-10-10T12:00:00Z", provider([{ content: " NOTHING\n" }]).handler, config);
  expect((await s.call("POST", "/api/check-in")).body).toEqual({ id: null });
  expect((await s.call("GET", "/api/chats")).body).toEqual([]);
  expect((await s.call("GET", "/api/settings")).body.lastCheckInAt).toBe("2026-10-10T12:00:00.000Z");
});

test("a provider failure surfaces to Check now and leaves the run due", async () => {
  const ai = provider([500, { content: report }]);
  const s = setup("2026-10-10T12:00:00Z", ai.handler, config);
  expect(await s.call("POST", "/api/check-in")).toEqual({
    status: 502,
    body: { error: "The AI provider returned an error (500)" },
  });
  expect((await s.call("GET", "/api/settings")).body.lastCheckInAt).toBeNull();
  await s.app.checkIn();
  expect((await s.call("GET", "/api/chats")).body).toHaveLength(1);
});

test("scheduled check-ins run weekly, only with AI configured and switched on", async () => {
  const ai = provider();
  const s = setup("2026-10-10T12:00:00Z", ai.handler, config);
  await s.app.checkIn();
  expect(ai.requests).toHaveLength(1);
  s.clock.now = new Date("2026-10-17T11:59:00Z");
  await s.app.checkIn();
  expect(ai.requests).toHaveLength(1);
  s.clock.now = new Date("2026-10-17T12:00:00Z");
  await s.app.checkIn();
  expect(ai.requests).toHaveLength(2);

  expect((await s.call("PUT", "/api/settings", { checkIns: false })).body.checkIns).toBe(false);
  s.clock.now = new Date("2026-11-30T12:00:00Z");
  await s.app.checkIn();
  expect(ai.requests).toHaveLength(2);

  const off = setup("2026-10-10T12:00:00Z", ai.handler);
  await off.app.checkIn();
  expect(ai.requests).toHaveLength(2);
  expect((await off.call("POST", "/api/check-in")).status).toBe(403);
});

test("a check-in offers only read tools and passes on earlier reports", async () => {
  const ai = provider([{ content: report }]);
  const s = setup("2026-10-10T12:00:00Z", ai.handler, config);
  await s.call("POST", "/api/check-in");
  const offered = ai.requests[0].tools.map((t: any) => t.function.name).sort();
  expect(offered).toEqual(["category_totals", "compare_periods", "list_transactions", "sql"]);

  await s.call("POST", "/api/check-in");
  expect(ai.requests[1].messages[0].content).toContain(`Check-in 10 Oct: ${report}`);
});

test("opening a check-in marks it read for every member", async () => {
  const s = setup("2026-10-10T12:00:00Z", provider([{ content: report }]).handler, config);
  const { id } = (await s.call("POST", "/api/check-in")).body;
  expect((await s.call("POST", `/api/chats/${id}/read`)).status).toBe(200);
  expect((await s.call("GET", "/api/chats")).body).toEqual([{ id, title: "Check-in 10 Oct", unread: false }]);
  expect((await s.call("POST", "/api/chats/999/read")).status).toBe(404);
});

test("earlier reports come from each check-in's report, not replies in its thread", async () => {
  const ai = provider([{ content: report }]);
  const s = setup("2026-10-10T12:00:00Z", ai.handler, config);
  const { id } = (await s.call("POST", "/api/check-in")).body;
  for (const n of [1, 2, 3, 4, 5]) {
    ai.script.push({ content: `Reply ${n}` });
    await s.call("POST", `/api/chats/${id}/messages`, { message: `Why ${n}?` });
  }
  await s.call("POST", "/api/check-in");
  const prompt = ai.requests.at(-1).messages[0].content;
  expect(prompt).toContain(`Check-in 10 Oct: ${report}`);
  expect(prompt).not.toContain("Reply");
});

test("replying 'make it recurring' in a check-in creates the schedule through chat actions", async () => {
  const ai = provider([{ content: report }]);
  const s = setup("2026-10-10T12:00:00Z", ai.handler, config);
  await s.call("POST", "/api/onboarding", { baseCurrency: "GBP" });
  const categoryId = (await s.call("GET", "/api/categories")).body.find((c: any) => c.name === "Subscriptions").id;
  const { id } = (await s.call("POST", "/api/check-in")).body;
  const args = { note: "Coffee club", amount: "4.10", categoryId, period: "month", every: 1 };
  ai.script.push(
    {
      tool_calls: [{ id: "r", type: "function", function: { name: "add_recurring", arguments: JSON.stringify(args) } }],
    },
    { content: "Done." },
  );
  await s.call("POST", `/api/chats/${id}/messages`, { message: "Make it recurring" });
  expect((await s.call("GET", "/api/recurring")).body).toEqual([expect.objectContaining({ note: "Coffee club" })]);
});
