import { expect, test } from "bun:test";
import { frankfurter, setup } from "./harness";

const config = { aiBaseUrl: "https://ai.test/v1", aiApiKey: "sk-test", aiModel: "test-model" };

function provider(script: Record<string, unknown>[] = []) {
  const requests: { auth: string | null; body: any }[] = [];
  const handler = (url: URL, init?: RequestInit) => {
    if (url.href !== "https://ai.test/v1/chat/completions") return;
    requests.push({ auth: new Headers(init?.headers).get("authorization"), body: JSON.parse(String(init?.body)) });
    return Response.json({ choices: [{ message: { role: "assistant", content: null, ...script.shift() } }] });
  };
  return { handler, requests, script };
}

const call = (name: string, args: unknown) => ({
  tool_calls: [{ id: `call-${name}`, type: "function", function: { name, arguments: JSON.stringify(args) } }],
});

test("without a key the AI is hidden and its endpoints refuse", async () => {
  const s = setup();
  expect((await s.call("GET", "/api/settings")).body.ai).toBe(false);
  expect((await s.call("GET", "/api/chats")).status).toBe(403);
  expect((await s.call("POST", "/api/chats", { message: "hi" })).status).toBe(403);
});

test("a chat is answered, saved with a title from the first question, listed and deleted", async () => {
  const ai = provider([{ content: "About £40." }, { content: "Cook more." }]);
  const { call } = setup(undefined, ai.handler, config);
  expect((await call("GET", "/api/settings")).body.ai).toBe(true);
  const chat = await call("POST", "/api/chats", { message: "How much did I spend on food this month?" });
  expect(chat.status).toBe(201);
  expect(chat.body.title).toBe("How much did I spend on food this month?");
  expect(chat.body.messages.at(-1)).toMatchObject({ role: "assistant", content: "About £40." });
  expect(ai.requests[0].auth).toBe("Bearer sk-test");
  expect(ai.requests[0].body.model).toBe("test-model");

  const next = await call("POST", `/api/chats/${chat.body.id}/messages`, { message: "How do I spend less?" });
  expect(next.body.messages.map((m: { content: string }) => m.content)).toEqual([
    "How much did I spend on food this month?",
    "About £40.",
    "How do I spend less?",
    "Cook more.",
  ]);
  expect(ai.requests[1].body.messages.filter((m: { role: string }) => m.role !== "system")).toHaveLength(3);
  expect((await call("GET", `/api/chats/${chat.body.id}`)).body).toEqual(next.body);
  expect((await call("GET", "/api/chats")).body).toEqual([{ id: chat.body.id, title: chat.body.title }]);

  expect((await call("DELETE", `/api/chats/${chat.body.id}`)).status).toBe(200);
  expect((await call("GET", "/api/chats")).body).toEqual([]);
  expect((await call("GET", `/api/chats/${chat.body.id}`)).status).toBe(404);
});

test("AI needs base URL and model as well as the key", async () => {
  for (const missing of ["aiBaseUrl", "aiModel"]) {
    const { call } = setup(undefined, undefined, { ...config, [missing]: undefined });
    expect((await call("GET", "/api/settings")).body.ai).toBe(false);
    expect((await call("GET", "/api/chats")).status).toBe(403);
  }
});

test("a provider failure saves neither the new chat nor the question", async () => {
  const ai = provider([{ content: "Hi" }]);
  let down = false;
  const { call } = setup(undefined, (url, init) => (down ? new Response("down", { status: 500 }) : ai.handler(url, init)), config);
  const chat = await call("POST", "/api/chats", { message: "first" });
  down = true;
  expect((await call("POST", "/api/chats", { message: "second" })).status).toBe(502);
  expect((await call("POST", `/api/chats/${chat.body.id}/messages`, { message: "again" })).status).toBe(502);
  expect((await call("GET", "/api/chats")).body).toEqual([{ id: chat.body.id, title: "first" }]);
  expect((await call("GET", `/api/chats/${chat.body.id}`)).body).toEqual(chat.body);
});

test("the system prompt says to leave out binned and pending expenses", async () => {
  const ai = provider([{ content: "Hi" }]);
  const { call } = setup(undefined, ai.handler, config);
  await call("POST", "/api/chats", { message: "hi" });
  expect(ai.requests[0].body.messages[0].content).toMatch(/binned.*pending.*leave them out/i);
});

async function withSpending() {
  const ai = provider();
  const rates = frankfurter({ "2026-08-01": { EUR: 0.8, GBP: 0.75 } });
  const s = setup("2026-10-10T12:00:00Z", (url, init) => ai.handler(url, init) ?? rates(url), config);
  await s.call("POST", "/api/onboarding", { baseCurrency: "GBP", currencies: ["GBP", "EUR"] });
  const all: { id: number; name: string }[] = (await s.call("GET", "/api/categories")).body;
  const id = (name: string) => all.find((c) => c.name === name)!.id;
  const spend = (note: string, amount: string, currency: string, date: string, category: string, tags: string[] = []) =>
    s.call("POST", "/api/expenses", { note, amount, currency, date, categoryId: id(category), tags });
  await spend("Shop", "10.00", "GBP", "2026-09-03", "Groceries", ["home"]);
  await spend("Cafe", "8.00", "EUR", "2026-09-05", "Eating out");
  await spend("Train", "6.00", "GBP", "2026-08-20", "Public transport", ["home"]);
  const binned = await spend("Binned", "100.00", "GBP", "2026-09-04", "Groceries", ["home"]);
  await s.call("DELETE", `/api/expenses/${binned.body.id}`);
  await s.call("POST", "/api/recurring", {
    note: "Power",
    amount: "50.00",
    currency: "GBP",
    categoryId: id("Utilities"),
    period: "month",
    every: 1,
    startDate: "2026-09-02",
    needsConfirmation: true,
  });
  const ask = async (message: string, ...script: Record<string, unknown>[]) => {
    ai.script.push(...script);
    const chat = await s.call("POST", "/api/chats", { message });
    return chat.body.messages.filter((m: { role: string }) => m.role === "tool").map((m: { content: string }) => JSON.parse(m.content));
  };
  return { ...s, ai, id, ask };
}

test("category totals for a range are in base currency and skip binned and pending expenses", async () => {
  const { ask, id } = await withSpending();
  const [result] = await ask(
    "What did I spend in September?",
    call("category_totals", { from: "2026-09-01", to: "2026-09-30" }),
    { content: "£17.50" },
  );
  expect(result).toMatchObject({ baseCurrency: "GBP", total: 1750 });
  expect(result.categories.map((c: { id: number; total: number }) => [c.id, c.total])).toEqual([[id("Food"), 1750]]);
});

test("listing expenses applies filters, values them in base currency and skips binned and pending ones", async () => {
  const { ask, id } = await withSpending();
  const [home, september, euros] = await ask(
    "Show my expenses",
    call("list_expenses", { tag: "home" }),
    call("list_expenses", { from: "2026-09-01", to: "2026-09-30" }),
    call("list_expenses", { category: id("Food"), currency: "EUR" }),
    { content: "Here they are" },
  );
  const brief = (rows: { note: string; baseAmount: number }[]) => rows.map((r) => [r.note, r.baseAmount]);
  expect(brief(home)).toEqual([["Shop", 1000], ["Train", 600]]);
  expect(brief(september)).toEqual([["Cafe", 750], ["Shop", 1000]]);
  expect(euros).toMatchObject([{ note: "Cafe", amount: 800, currency: "EUR", baseAmount: 750, date: "2026-09-05" }]);
});

test("comparing two periods gives totals for each", async () => {
  const { ask, id } = await withSpending();
  const [{ first, second }] = await ask(
    "Did I spend more in September than August?",
    call("compare_periods", { first: { from: "2026-08-01", to: "2026-08-31" }, second: { from: "2026-09-01", to: "2026-09-30" } }),
    { content: "More in September" },
  );
  expect([first.total, second.total]).toEqual([600, 1750]);
  expect(first.categories.map((c: { id: number }) => c.id)).toEqual([id("Transport")]);
});

test("read-only SQL sees the data but cannot write, and caps rows and time", async () => {
  const { ask, call: api, ai } = await withSpending();
  const [notes, write, many, slow] = await ask(
    "Anything",
    call("sql", { query: "SELECT note FROM expenses WHERE deleted_at IS NULL AND status = 'normal' ORDER BY note" }),
    call("sql", { query: "DELETE FROM expenses" }),
    call("sql", { query: "WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM n WHERE x < 500) SELECT x FROM n" }),
    call("sql", { query: "WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM n) SELECT count(*) FROM n" }),
    { content: "Done" },
  );
  expect(notes).toEqual({ rows: [{ note: "Cafe" }, { note: "Shop" }, { note: "Train" }], truncated: false });
  expect(write.error).toContain("readonly");
  expect((await api("GET", "/api/expenses")).body).toHaveLength(5);
  expect(many.rows).toHaveLength(200);
  expect(many.truncated).toBe(true);
  expect(slow.error).toContain("timed out");
  expect(ai.requests[0].body.tools.find((t: any) => t.function.name === "sql").function.description).toContain(
    "deleted_at IS NULL AND status = 'normal'",
  );
}, 10_000);

test("drafting an expense resolves it against categories and currencies but saves nothing until created", async () => {
  const { ask, call: api, id, ai } = await withSpending();
  const before = (await api("GET", "/api/expenses")).body;
  const [draft, wrongCurrency, wrongCategory] = await ask(
    "lunch 12 euros yesterday",
    call("draft_expense", { note: "Lunch", amount: "12", currency: "EUR", date: "2026-10-09", categoryId: id("Eating out"), tags: ["work"] }),
    call("draft_expense", { note: "Lunch", amount: "12", currency: "JPY" }),
    call("draft_expense", { note: "Lunch", amount: "12", categoryId: 999 }),
    { content: "Check the draft" },
  );
  expect(draft).toEqual({
    draft: { note: "Lunch", amount: 1200, currency: "EUR", date: "2026-10-09", categoryId: id("Eating out"), tags: ["work"] },
  });
  expect(wrongCurrency.error).toContain("That currency isn’t enabled");
  expect(wrongCategory.error).toContain("Invalid category");
  expect(ai.requests[0].body.messages[0].content).toContain("Today is 2026-10-10");
  expect((await api("GET", "/api/expenses")).body).toEqual(before);

  const { amount, ...rest } = draft.draft;
  const saved = await api("POST", "/api/expenses", { ...rest, amount: "12.00" });
  expect(saved.body).toMatchObject(draft.draft);
  expect((await api("GET", "/api/expenses")).body).toHaveLength(before.length + 1);
});
