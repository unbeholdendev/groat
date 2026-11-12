import { expect, test } from "bun:test";
import { completion, frankfurter, models, setup } from "./harness";

const config = { baseUrl: "https://ai.test/v1", key: "sk-test" };
const listed = models(["test-model"]);

function provider(script: Record<string, unknown>[] = []) {
  const requests: { auth: string | null; body: any }[] = [];
  const handler = (url: URL, init?: RequestInit) => {
    if (url.href !== "https://ai.test/v1/chat/completions") return listed(url);
    requests.push({ auth: new Headers(init?.headers).get("authorization"), body: JSON.parse(String(init?.body)) });
    return completion({ role: "assistant", content: null, ...script.shift() });
  };
  return { handler, requests, script };
}

let nextCall = 0;
const call = (name: string, args: unknown) => ({
  tool_calls: [{ id: `call-${nextCall++}`, type: "function", function: { name, arguments: JSON.stringify(args) } }],
});

test("without a key inference refuses but shared history remains available", async () => {
  const s = setup();
  expect((await s.call("GET", "/api/ai/status")).body.ai).toBe(false);
  expect((await s.call("GET", "/api/chats")).status).toBe(200);
  expect((await s.call("POST", "/api/chats", { message: "hi" })).status).toBe(403);
});

test("a chat is answered, saved with a title from the first question, listed and deleted", async () => {
  const ai = provider([{ content: "About £40." }, { content: "Cook more." }]);
  const { call } = setup(undefined, ai.handler, config);
  expect((await call("GET", "/api/ai/status")).body.ai).toBe(true);
  const chat = await call("POST", "/api/chats", { message: "How much did I spend on food this month?" });
  expect(chat.status).toBe(202);
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

test("AI needs the base URL as well as the key", async () => {
  for (const missing of ["baseUrl", "key"]) {
    const { call } = setup(undefined, listed, { ...config, [missing]: undefined });
    expect((await call("GET", "/api/ai/status")).body.ai).toBe(false);
    expect((await call("GET", "/api/chats")).status).toBe(200);
  }
});

test("a provider failure ends the run with its error in the chat", async () => {
  const ai = provider([{ content: "Hi" }]);
  let down = false;
  const { call } = setup(
    undefined,
    (url, init) => (down ? new Response("down", { status: 500 }) : ai.handler(url, init)),
    config,
  );
  const chat = await call("POST", "/api/chats", { message: "first" });
  down = true;
  const failed = { role: "assistant", content: "The AI provider returned an error (500)" };
  expect((await call("POST", "/api/chats", { message: "second" })).body).toMatchObject({
    running: false,
    messages: [{ role: "user", content: "second" }, failed],
  });
  expect(
    (await call("POST", `/api/chats/${chat.body.id}/messages`, { message: "again" })).body.messages.slice(2),
  ).toEqual([{ role: "user", content: "again" }, failed]);
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
  await s.call("POST", "/api/onboarding", { baseCurrency: "GBP" });
  const all: { id: number; name: string }[] = (await s.call("GET", "/api/categories")).body;
  const id = (name: string) => all.find((c) => c.name === name)!.id;
  const spend = (note: string, amount: string, currency: string, date: string, category: string, tags: string[] = []) =>
    s.call("POST", "/api/transactions", { note, amount, currency, date, categoryId: id(category), tags });
  await spend("Shop", "10.00", "GBP", "2026-09-03", "Groceries", ["home"]);
  await spend("Cafe", "8.00", "EUR", "2026-09-05", "Eating out");
  await spend("Train", "6.00", "GBP", "2026-08-20", "Public transport", ["home"]);
  const binned = await spend("Binned", "100.00", "GBP", "2026-09-04", "Groceries", ["home"]);
  await s.call("DELETE", `/api/transactions/${binned.body.id}`);
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
    return chat.body.messages
      .filter((m: { role: string }) => m.role === "tool")
      .map((m: { content: string }) => JSON.parse(m.content));
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
    call("list_transactions", { tag: "home" }),
    call("list_transactions", { from: "2026-09-01", to: "2026-09-30" }),
    call("list_transactions", { category: id("Food"), currency: "EUR" }),
    { content: "Here they are" },
  );
  const brief = (rows: { note: string; baseAmount: number }[]) => rows.map((r) => [r.note, r.baseAmount]);
  expect(brief(home)).toEqual([
    ["Shop", 1000],
    ["Train", 600],
  ]);
  expect(brief(september)).toEqual([
    ["Cafe", 750],
    ["Shop", 1000],
  ]);
  expect(euros).toMatchObject([{ note: "Cafe", amount: 800, currency: "EUR", baseAmount: 750, date: "2026-09-05" }]);
});

test("comparing two periods gives totals for each", async () => {
  const { ask, id } = await withSpending();
  const [{ first, second }] = await ask(
    "Did I spend more in September than August?",
    call("compare_periods", {
      first: { from: "2026-08-01", to: "2026-08-31" },
      second: { from: "2026-09-01", to: "2026-09-30" },
    }),
    { content: "More in September" },
  );
  expect([first.total, second.total]).toEqual([600, 1750]);
  expect(first.categories.map((c: { id: number }) => c.id)).toEqual([id("Transport")]);
});

test("read-only SQL sees the data but cannot write, and caps rows and time", async () => {
  const { ask, call: api, ai } = await withSpending();
  const [notes, write, many, slow] = await ask(
    "Anything",
    call("sql", {
      query: "SELECT note FROM transactions WHERE deleted_at IS NULL AND status = 'normal' ORDER BY note",
    }),
    call("sql", { query: "DELETE FROM transactions" }),
    call("sql", {
      query: "WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM n WHERE x < 500) SELECT x FROM n",
    }),
    call("sql", { query: "WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM n) SELECT count(*) FROM n" }),
    { content: "Done" },
  );
  expect(notes).toEqual({ rows: [{ note: "Cafe" }, { note: "Shop" }, { note: "Train" }], truncated: false });
  expect(write.error).toContain("readonly");
  expect((await api("GET", "/api/transactions")).body).toHaveLength(5);
  expect(many.rows).toHaveLength(200);
  expect(many.truncated).toBe(true);
  expect(slow.error).toContain("timed out");
  expect(ai.requests[0].body.tools.find((t: any) => t.function.name === "sql").function.description).toContain(
    "deleted_at IS NULL AND status = 'normal'",
  );
}, 10_000);

test("drafting an expense resolves it against categories and currencies but saves nothing until created", async () => {
  const { ask, call: api, id, ai } = await withSpending();
  const before = (await api("GET", "/api/transactions")).body;
  const [draft, wrongCurrency, wrongCategory] = await ask(
    "lunch 12 euros yesterday",
    call("draft_transaction", {
      note: "Lunch",
      amount: "12",
      currency: "EUR",
      date: "2026-10-09",
      categoryId: id("Eating out"),
      tags: ["work"],
    }),
    call("draft_transaction", { note: "Lunch", amount: "12", currency: "XYZ" }),
    call("draft_transaction", { note: "Lunch", amount: "12", categoryId: 999 }),
    { content: "Check the draft" },
  );
  expect(draft).toEqual({
    draft: {
      note: "Lunch",
      amount: 1200,
      currency: "EUR",
      date: "2026-10-09",
      categoryId: id("Eating out"),
      tags: ["work"],
    },
  });
  expect(wrongCurrency.error).toContain("Invalid currency");
  expect(wrongCategory.error).toContain("Invalid category");
  expect(ai.requests[0].body.messages[0].content).toContain("Today is 2026-10-10");
  expect((await api("GET", "/api/transactions")).body).toEqual(before);

  const { amount, ...rest } = draft.draft;
  const saved = await api("POST", "/api/transactions", { ...rest, amount: "12.00" });
  expect(saved.body).toMatchObject(draft.draft);
  expect((await api("GET", "/api/transactions")).body).toHaveLength(before.length + 1);
});

test("a chat draft without a currency uses the last-used currency", async () => {
  const ai = provider();
  const s = setup(undefined, ai.handler, config);
  await s.call("POST", "/api/onboarding", { baseCurrency: "GBP" });
  await s.call("POST", "/api/transactions", { note: "Cafe", amount: "8", currency: "EUR", date: "2026-10-02" });
  ai.script.push(call("draft_transaction", { note: "Lunch", amount: "12" }), { content: "Check the draft" });
  const chat = await s.call("POST", "/api/chats", { message: "lunch 12" });
  const [result] = chat.body.messages
    .filter((m: { role: string }) => m.role === "tool")
    .map((m: { content: string }) => JSON.parse(m.content));
  expect(result.draft).toMatchObject({ amount: 1200, currency: "EUR" });
  const tool = ai.requests[0].body.tools.find((t: any) => t.function.name === "draft_transaction");
  expect(tool.function.parameters.properties.currency.description).toContain("defaults to the last used");
});

test("the AI knows category kinds, and drafts only expenses", async () => {
  const { ask, id, ai } = await withSpending();
  const [salary] = await ask(
    "I got paid",
    call("draft_transaction", { note: "Pay", amount: "3000", categoryId: id("Salary") }),
    { content: "No" },
  );
  expect(salary.error).toContain("expenses only");
  const prompt = ai.requests[0].body.messages[0].content;
  expect(prompt).toMatch(/kind, expense or income/);
  expect(prompt).toContain(`"name":"Salary","parentId":null,"kind":"income"`);
});

test("AI tools report incomplete totals and use the same rates as lists", async () => {
  const ai = provider();
  let up = false;
  const t = setup(
    undefined,
    (url, init) => (up ? frankfurter({ "2026-10-02": { EUR: 0.8 } })(url) : undefined) ?? ai.handler(url, init),
    config,
  );
  await t.call("POST", "/api/onboarding", { baseCurrency: "USD" });
  await t.call("POST", "/api/transactions", { note: "Foreign", amount: "10", currency: "EUR", date: "2026-10-02" });
  const ask = async (name: string, args: unknown) => {
    ai.script.push(call(name, args), { content: "done" });
    const result = await t.call("POST", "/api/chats", { message: "spending" });
    return JSON.parse(result.body.messages.find((m: any) => m.role === "tool").content);
  };
  expect(await ask("category_totals", { from: "2026-10-02", to: "2026-10-02" })).toMatchObject({
    total: 0,
    unconverted: 1,
  });
  up = true;
  t.clock.now = new Date("2026-10-10T12:11:00Z");
  expect(await ask("category_totals", { from: "2026-10-02", to: "2026-10-02" })).toMatchObject({
    total: 1250,
    unconverted: 0,
  });
  expect((await ask("list_transactions", {}))[0]).toMatchObject({
    baseAmount: 1250,
    conversion: { from: { source: "frankfurter" } },
  });
});

test("explicit chat actions execute once through ledger validation", async () => {
  const { ask, call: api } = await withSpending();
  const input = { note: "Lunch", amount: "12", currency: "GBP" };
  const add = call("add_transaction", input);
  const [saved, repeated, invalid] = await ask(
    "Add lunch for £12",
    add,
    add,
    call("add_transaction", { ...input, amount: "-1" }),
    { content: "Added lunch." },
  );
  expect(saved).toMatchObject({ outcome: "completed", result: { note: "Lunch", amount: 1200 } });
  expect(repeated).toEqual(saved);
  expect(invalid.error).toContain("Invalid amount");
  expect((await api("GET", "/api/transactions")).body.filter((t: any) => t.note === "Lunch")).toHaveLength(1);
});

test("a provider failure after an action preserves its outcome for continuation", async () => {
  const ai = provider([call("add_transaction", { note: "Coffee", amount: "3" })]);
  let requests = 0;
  const s = setup(
    undefined,
    (url, init) => {
      if (url.href.endsWith("/chat/completions") && ++requests === 2) return new Response("down", { status: 500 });
      return ai.handler(url, init);
    },
    config,
  );
  const chat = await s.call("POST", "/api/chats", { message: "Add coffee for 3" });
  expect(chat.status).toBe(202);
  expect(chat.body.messages.some((m: any) => m.role === "tool" && m.content.includes('"outcome":"completed"'))).toBe(
    true,
  );
  expect(chat.body.messages.at(-1).content).toBe("The AI provider returned an error (500)");
  ai.script.push({ content: "Coffee was added." });
  await s.call("POST", `/api/chats/${chat.body.id}/messages`, { message: "What happened?" });
  expect((await s.call("GET", "/api/transactions")).body.filter((t: any) => t.note === "Coffee")).toHaveLength(1);
});

test("chat actions cover category, income, transaction bin and recurring operations", async () => {
  const { ask, call: api, id } = await withSpending();
  const [category] = await ask(
    "Create a category",
    call("add_category", { name: "Books", icon: "📚", color: "#123456" }),
    { content: "Created." },
  );
  expect(category.outcome).toBe("completed");
  const [income] = await ask(
    "Record pay",
    call("add_transaction", { note: "Pay", amount: "100", categoryId: id("Salary") }),
    { content: "Added." },
  );
  expect(income.result.categoryId).toBe(id("Salary"));
  const transactionId = income.result.id;
  const [binned, restored, missing] = await ask(
    "Bin and restore pay",
    call("bin_transaction", { id: transactionId }),
    call("restore_transaction", { id: transactionId }),
    call("confirm_transaction", { id: 999999 }),
    { content: "Restored." },
  );
  expect(binned.outcome).toBe("completed");
  expect(restored.outcome).toBe("completed");
  expect(missing.error).toBe("Not found");
  const [recurring] = await ask(
    "Schedule books",
    call("add_recurring", {
      note: "Books",
      amount: "5",
      categoryId: category.result.id,
      period: "month",
      every: 1,
    }),
    { content: "Scheduled." },
  );
  expect(recurring.outcome).toBe("completed");
  await ask("Pause it", call("pause_recurring", { id: recurring.result.id }), { content: "Paused." });
  expect((await api("GET", "/api/recurring")).body.find((r: any) => r.id === recurring.result.id).paused).toBe(true);
});

test("malformed and unknown chat tools report errors without writing", async () => {
  const { ask, call: api } = await withSpending();
  const before = (await api("GET", "/api/transactions")).body;
  const [malformed, unknown] = await ask(
    "Add something",
    { tool_calls: [{ id: "bad", function: { name: "add_transaction", arguments: "{" } }] },
    call("change_settings", {}),
    { content: "Please give the amount and note." },
  );
  expect(malformed.error).toBeString();
  expect(unknown.error).toContain("Unsupported action");
  expect((await api("GET", "/api/transactions")).body).toEqual(before);
});

test("all offered tools use object parameters and category ordering executes", async () => {
  const ai = provider([{ content: "Ready" }]);
  const s = setup(undefined, ai.handler, config);
  await s.call("POST", "/api/chats", { message: "hi" });
  for (const { function: tool } of ai.requests[0].body.tools) expect(tool.parameters.type).toBe("object");
  const categories = (await s.call("GET", "/api/categories")).body;
  const ids = categories
    .filter((c: { kind: string }) => c.kind === "expense")
    .map((c: { id: number }) => c.id)
    .reverse();
  ai.script.push(call("order_categories", { ids }), { content: "Reordered." });
  const chat = await s.call("POST", "/api/chats", { message: "Reverse my category order" });
  expect(JSON.parse(chat.body.messages.find((m: any) => m.role === "tool").content)).toMatchObject({
    outcome: "completed",
  });
  expect(
    (await s.call("GET", "/api/categories")).body
      .filter((c: { kind: string }) => c.kind === "expense")
      .map((c: { id: number }) => c.id),
  ).toEqual(ids);
});

test("distinct calls can save two separate identical expenses", async () => {
  const { ask, call: api } = await withSpending();
  const args = { note: "Identical coffee", amount: "3", currency: "GBP" };
  await ask(
    "Add two separate identical coffees for £3 each",
    {
      tool_calls: ["first-coffee", "second-coffee"].map((id) => ({
        id,
        type: "function",
        function: { name: "add_transaction", arguments: JSON.stringify(args) },
      })),
    },
    { content: "Added both coffees." },
  );
  expect((await api("GET", "/api/transactions")).body.filter((t: any) => t.note === "Identical coffee")).toHaveLength(
    2,
  );
});

const post = (s: ReturnType<typeof setup>, message: string, path = "/api/chats") =>
  s.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message }),
  });

async function finished(s: ReturnType<typeof setup>) {
  for (;;) {
    const row = s.db.query<{ message: string }, []>("SELECT message FROM chat_messages ORDER BY id DESC LIMIT 1").get();
    const last = row && JSON.parse(row.message);
    if (last?.role === "assistant" && !last.tool_calls) return last;
    await Bun.sleep(1);
  }
}

function held(script: Record<string, unknown>[], round: number) {
  const ai = provider(script);
  let reached!: () => void;
  let open!: () => void;
  const ready = new Promise<void>((resolve) => {
    reached = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  let rounds = 0;
  const handler = async (url: URL, init?: RequestInit) => {
    if (url.pathname.endsWith("/chat/completions") && ++rounds === round) {
      reached();
      await new Promise<void>((resolve, reject) => {
        void gate.then(resolve);
        init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
      });
    }
    return ai.handler(url, init) ?? new Response("not found", { status: 404 });
  };
  return { handler, ready, open };
}

const roles = (chat: { messages: { role: string }[] }) => chat.messages.map((m) => m.role);

test("a run saves each step as it completes and refuses another question until it ends", async () => {
  const ai = held([call("add_transaction", { note: "Coffee", amount: "3" }), { content: "Added coffee." }], 2);
  const s = setup(undefined, ai.handler, config);
  const started = await post(s, "Add coffee for 3");
  expect(started.status).toBe(202);
  const { id } = await started.json();
  await ai.ready;
  const running = (await s.call("GET", `/api/chats/${id}`)).body;
  expect(running.running).toBe(true);
  expect(roles(running)).toEqual(["user", "assistant", "tool"]);
  expect(await (await post(s, "And tea", `/api/chats/${id}/messages`)).json()).toEqual({
    error: "Wait for the reply, or stop it first",
  });
  ai.open();
  expect(await finished(s)).toEqual({ role: "assistant", content: "Added coffee." });
  expect(roles((await s.call("GET", `/api/chats/${id}`)).body)).toEqual(["user", "assistant", "tool", "assistant"]);
});

test("stopping a run aborts the provider call, keeps the steps so far and runs no further action", async () => {
  const ai = held(
    [call("add_transaction", { note: "First", amount: "3" }), call("add_transaction", { note: "Second", amount: "3" })],
    2,
  );
  const s = setup(undefined, ai.handler, config);
  const { id } = await (await post(s, "Add two coffees")).json();
  await ai.ready;
  expect((await s.call("POST", `/api/chats/${id}/stop`)).status).toBe(200);
  expect(await finished(s)).toEqual({ role: "assistant", content: "Stopped." });
  expect(roles((await s.call("GET", `/api/chats/${id}`)).body)).toEqual(["user", "assistant", "tool", "assistant"]);
  expect(s.db.query("SELECT note FROM transactions").all()).toEqual([{ note: "First" }]);
});

test("a deleted chat's unfinished run cannot write into a new chat that reuses its ID", async () => {
  const ai = provider([
    call("add_transaction", { note: "Euro coffee", amount: "3", currency: "EUR" }),
    { content: "Hello" },
  ]);
  const rates = frankfurter({ "2026-10-01": { EUR: 0.8, GBP: 0.75 } });
  let reached!: () => void;
  let release!: () => void;
  const converting = new Promise<void>((resolve) => {
    reached = resolve;
  });
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const s = setup(
    undefined,
    async (url, init) => {
      if (url.host !== "api.frankfurter.dev")
        return ai.handler(url, init) ?? new Response("not found", { status: 404 });
      reached();
      await held;
      return rates(url) ?? new Response("not found", { status: 404 });
    },
    config,
  );
  await s.call("POST", "/api/onboarding", { baseCurrency: "GBP" });
  const { id } = await (await post(s, "Add a euro coffee")).json();
  await converting;
  await s.call("DELETE", `/api/chats/${id}`);
  const next = (await s.call("POST", "/api/chats", { message: "hi" })).body;
  expect(next.id).toBe(id);
  release();
  await Bun.sleep(50);
  expect((await s.call("GET", `/api/chats/${id}`)).body).toMatchObject({
    running: false,
    messages: [
      { role: "user", content: "hi" },
      { role: "assistant", content: "Hello" },
    ],
  });
});

test("a restart marks a run left unfinished as interrupted, keeping finished chats as they are", async () => {
  const ai = held([{ content: "Hello" }, { content: "Never sent" }], 2);
  const s = setup(undefined, ai.handler, config);
  const done = (await s.call("POST", "/api/chats", { message: "hi" })).body;
  const { id } = await (await post(s, "Add coffee for 3")).json();
  await ai.ready;
  s.restart();
  expect((await s.call("GET", `/api/chats/${done.id}`)).body).toEqual(done);
  expect((await s.call("GET", `/api/chats/${id}`)).body).toMatchObject({
    running: false,
    messages: [
      { role: "user" },
      { role: "assistant", content: "Interrupted by a server restart. Check the steps above before asking again." },
    ],
  });
});

for (const [reason, revoke] of [
  ["revoked", "DELETE FROM sessions"],
  ["expired", "UPDATE sessions SET expires_at = '2000'"],
  ["removed user", "UPDATE users SET deleted_at = '2026-10-10'"],
] as const)
  test(`chat actions stop when their originating session is ${reason}`, async () => {
    let release!: () => void;
    let started!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const ai = provider([call("add_transaction", { note: "Revoked write", amount: "3" }), { content: "Added." }]);
    const s = setup(
      undefined,
      async (url, init) => {
        if (url.pathname.endsWith("/chat/completions")) {
          started();
          await pending;
        }
        return ai.handler(url, init) ?? new Response("not found", { status: 404 });
      },
      config,
    );
    expect((await post(s, "Add coffee for 3")).status).toBe(202);
    await ready;
    s.db.run(revoke);
    release();
    expect(await finished(s)).toEqual({ role: "assistant", content: "Your session ended. Sign in again." });
    expect(s.db.query("SELECT count(*) AS n FROM transactions").get()).toEqual({ n: 0 });
  });

test("revoking a session between tool rounds stops every later action", async () => {
  let release!: () => void;
  let started!: () => void;
  let rounds = 0;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const ai = provider([
    call("add_transaction", { note: "Before revocation", amount: "3" }),
    {
      tool_calls: [
        call("add_transaction", { note: "After revocation", amount: "3" }).tool_calls[0],
        call("empty_bin", {}).tool_calls[0],
      ],
    },
  ]);
  const s = setup(
    undefined,
    async (url, init) => {
      if (url.pathname.endsWith("/chat/completions") && ++rounds === 2) {
        started();
        await pending;
      }
      return ai.handler(url, init) ?? new Response("not found", { status: 404 });
    },
    config,
  );
  await post(s, "Add these two expenses");
  await ready;
  s.db.run("DELETE FROM sessions");
  release();
  expect(await finished(s)).toMatchObject({ content: "Your session ended. Sign in again." });
  expect(s.db.query("SELECT note FROM transactions").all()).toEqual([{ note: "Before revocation" }]);
});

test("chat tools use JSON Schema bounds and nullable types", async () => {
  const ai = provider([{ content: "Ready" }]);
  const s = setup(undefined, ai.handler, config);
  expect((await s.call("POST", "/api/chats", { message: "hi" })).status).toBe(202);
  const tools = ai.requests[0].body.tools;
  const check = (schema: any) => {
    if (!schema || typeof schema !== "object") return;
    for (const bound of ["exclusiveMinimum", "exclusiveMaximum"])
      if (bound in schema) expect(typeof schema[bound]).toBe("number");
    expect(schema).not.toHaveProperty("nullable");
    for (const value of Object.values(schema)) check(value);
  };
  for (const { function: tool } of tools) check(tool.parameters);
  const parameters = (name: string) => tools.find((t: any) => t.function.name === name).function.parameters;
  expect(parameters("bin_transaction").properties.id.exclusiveMinimum).toBe(0);
  expect(parameters("add_category").properties.parentId.anyOf).toContainEqual({ type: "null" });
  expect(parameters("add_recurring").properties.endDate.type).toEqual(["string", "null"]);
  expect(parameters("add_category").required).not.toContain("parentId");
});

test("truncated completion streams cannot execute a partial action", async () => {
  for (const finish_reason of [null, "length"]) {
    const tool = call("add_transaction", { note: "Coffee", amount: "3" }).tool_calls[0];
    const chunk = {
      choices: [{ index: 0, delta: { role: "assistant", tool_calls: [{ index: 0, ...tool }] }, finish_reason }],
    };
    const { call: api } = setup(
      undefined,
      (url) =>
        listed(url) ??
        new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, {
          headers: { "content-type": "text/event-stream" },
        }),
      config,
    );
    expect((await api("POST", "/api/chats", { message: "Add coffee" })).body.messages.at(-1)).toEqual({
      role: "assistant",
      content: "The AI provider sent an unexpected reply",
    });
    expect((await api("GET", "/api/transactions")).body).toEqual([]);
  }
});

test("a saved chat with malformed legacy tool arguments can continue", async () => {
  const ai = provider([
    { tool_calls: [{ id: "legacy", function: { name: "add_transaction", arguments: "{" } }] },
    { content: "Please give the amount." },
    { content: "Hello again." },
  ]);
  const h = setup(undefined, ai.handler, config);
  const chat = await h.call("POST", "/api/chats", { message: "Add something" });
  expect(chat.status).toBe(202);
  h.db.run(
    "UPDATE chat_messages SET message = json_set(message, '$.tool_calls[0].function.arguments', '{') WHERE json_extract(message, '$.tool_calls[0].id') = 'legacy'",
  );
  const next = await h.call("POST", `/api/chats/${chat.body.id}/messages`, { message: "Hello" });
  expect(next.status).toBe(202);
  expect(next.body.messages.at(-1).content).toBe("Hello again.");
  expect((await h.call("GET", "/api/transactions")).body).toEqual([]);
});
