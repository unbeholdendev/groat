import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { completion, setup } from "./harness";
import { request } from "node:http";
import { websocket } from "hono/bun";

let output: ReturnType<typeof spyOn<typeof console, "log">>;
let errors: ReturnType<typeof spyOn<typeof console, "error">>;
const previousLevel = process.env.LOG_LEVEL;
const entries = () => [...output.mock.calls, ...errors.mock.calls].map(([line]) => JSON.parse(String(line)));
const logged = async (event: string) => {
  while (!entries().some((e) => e.event === event)) await Bun.sleep(1);
};

beforeEach(() => {
  process.env.LOG_LEVEL = "debug";
  output = spyOn(console, "log").mockImplementation(() => {});
  errors = spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  output.mockRestore();
  errors.mockRestore();
  if (previousLevel === undefined) delete process.env.LOG_LEVEL;
  else process.env.LOG_LEVEL = previousLevel;
});

test("requests return a generated correlation ID and log route patterns without private input", async () => {
  const s = setup();
  output.mockClear();
  const response = await s.request("/api/transactions/private-record?note=private-query", {
    method: "DELETE", headers: { "x-request-id": "private-header", authorization: "Bearer private-token" },
  });
  const id = response.headers.get("x-request-id");
  expect(id).toMatch(/^[a-f0-9-]{36}$/);
  expect(entries()).toContainEqual(expect.objectContaining({
    event: "http.request.completed", requestId: id, method: "DELETE", route: "/api/transactions/:id", status: response.status,
    durationMs: expect.any(Number), timestamp: expect.any(String), level: expect.any(String),
  }));
  expect(JSON.stringify(entries())).not.toContain("private");
});

test("outbound calls and handled failures share the incoming request ID", async () => {
  const s = setup(undefined, (url) => {
    if (url.pathname.endsWith("/models")) return Response.json({ data: [{ id: "test" }] });
    return new Response("private-provider-error", { status: 503 });
  }, { baseUrl: "https://private-user:private-password@ai.test/private-path", key: "private-key" });
  output.mockClear();
  const res = await s.request("/api/chats", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "private-prompt" }),
  });
  expect(res.status).toBe(202);
  const id = res.headers.get("x-request-id");
  await logged("ai.reply.failed");
  expect(entries()).toContainEqual(expect.objectContaining({ event: "http.outbound.response", requestId: id, operation: "chat_completions", status: 503, level: "warn" }));
  expect(entries()).toContainEqual(expect.objectContaining({ event: "ai.reply.failed", requestId: id, level: "warn", error: "Error" }));
  expect(JSON.stringify(entries())).not.toContain("private");
});

test("the actual WebSocket handshake carries the request ID and logs status 101", async () => {
  const s = setup();
  s.db.run("INSERT INTO sessions (id, user_id, expires_at) VALUES ('live', 1, '9999')");
  const server = Bun.serve({ port: 0, fetch: s.app.fetch, websocket });
  try {
    const response = await new Promise<import("node:http").IncomingMessage>((resolve, reject) => {
      const req = request(new URL("/api/live", server.url), { headers: {
        origin: server.url.origin, cookie: "session=live", connection: "Upgrade", upgrade: "websocket",
        "sec-websocket-version": "13", "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
      } });
      req.on("upgrade", (response, socket) => { socket.destroy(); resolve(response); });
      req.on("response", (response) => { response.resume(); reject(new Error(`Upgrade returned ${response.statusCode}`)); });
      req.on("error", reject);
      req.end();
    });
    expect(response.statusCode).toBe(101);
    expect(response.headers["x-request-id"]).toMatch(/^[a-f0-9-]{36}$/);
    expect(entries()).toContainEqual(expect.objectContaining({
      event: "http.request.completed", requestId: response.headers["x-request-id"], route: "/api/live", status: 101,
    }));
  } finally {
    s.app.close();
    await server.stop(true);
  }
});

test("concurrent requests keep their correlation IDs separate", async () => {
  const s = setup(undefined, async (url) => {
    if (url.pathname.endsWith("/models")) return Response.json({ data: [{ id: "test" }] });
    await new Promise((resolve) => setTimeout(resolve, 5));
    return completion({ role: "assistant", content: "done" });
  }, { baseUrl: "https://ai.test/v1", key: "private-key" });
  output.mockClear();
  const responses = await Promise.all([1, 2].map(() => s.request("/api/chats", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "private-prompt" }),
  })));
  const ids = responses.map((r) => r.headers.get("x-request-id"));
  expect(new Set(ids).size).toBe(2);
  const calls = () => entries().filter((e) => e.event === "http.outbound.response" && e.operation === "chat_completions");
  while (calls().length < 2) await Bun.sleep(1);
  expect(calls().map((e) => e.requestId).sort()).toEqual(ids.sort());
});

test("LOG_LEVEL filters routine logs and silent disables output", async () => {
  const s = setup();
  output.mockClear(); errors.mockClear();
  process.env.LOG_LEVEL = "warn";
  await s.request("/api/transactions");
  expect(entries()).toEqual([]);
  await s.app.request("/api/transactions");
  expect(entries()).toContainEqual(expect.objectContaining({ level: "warn", status: 401 }));
  output.mockClear(); errors.mockClear();
  process.env.LOG_LEVEL = "silent";
  await s.app.request("/api/transactions");
  expect(entries()).toEqual([]);
});

test("transport failures log their category and request ID without the exception message", async () => {
  const s = setup(undefined, (url) => {
    if (url.pathname.endsWith("/models")) return Response.json({ data: [{ id: "test" }] });
    throw new TypeError("private-network-details");
  }, { baseUrl: "https://ai.test/v1", key: "private-key" });
  const res = await s.request("/api/chats", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "private-prompt" }),
  });
  expect(res.status).toBe(202);
  await logged("ai.reply.failed");
  expect(entries()).toContainEqual(expect.objectContaining({
    event: "http.outbound.failed", requestId: res.headers.get("x-request-id"), error: "TypeError", operation: "chat_completions",
  }));
  expect(JSON.stringify(entries())).not.toContain("private");
});

test("unhandled API exceptions retain a generic response and produce one request error", async () => {
  const s = setup();
  s.app.get("/failure", () => { throw new Error("private-database-details"); });
  const res = await s.app.request("/failure");
  expect(res.status).toBe(500);
  expect(await res.text()).toBe("Internal Server Error");
  expect(entries().filter((e) => e.event === "http.request.completed")).toEqual([
    expect.objectContaining({ level: "error", requestId: res.headers.get("x-request-id"), status: 500, error: "Error" }),
  ]);
  expect(JSON.stringify(entries())).not.toContain("private");
});

test("migration and recurring generation log outcomes, counts and failures without row data", async () => {
  const s = setup();
  expect(entries()).toContainEqual(expect.objectContaining({ event: "database.migration.completed", level: "info" }));
  await s.call("POST", "/api/recurring", { note: "private-note", amount: "2", period: "day", every: 1 });
  expect(entries()).toContainEqual(expect.objectContaining({ event: "recurring.generate.completed", count: 1, level: "info" }));
  s.db.close();
  expect(() => s.app.generate()).toThrow();
  expect(entries()).toContainEqual(expect.objectContaining({ event: "recurring.generate.failed", level: "error" }));
  expect(JSON.stringify(entries())).not.toContain("private");
});

test("internal AI action failures cannot write raw database exceptions to stderr", async () => {
  let turn = 0;
  const s = setup(undefined, (url) => {
    if (url.pathname.endsWith("/models")) return Response.json({ data: [{ id: "test" }] });
    const message = turn++ ? { role: "assistant", content: "Failed" } : { role: "assistant", tool_calls: [{
      id: "call", type: "function", function: { name: "add_transaction", arguments: JSON.stringify({ note: "private-note", amount: "2" }) },
    }] };
    return completion(message);
  }, { baseUrl: "https://ai.test/v1", key: "private-key" });
  s.db.run("CREATE TRIGGER fail_insert BEFORE INSERT ON transactions BEGIN SELECT RAISE(ABORT, 'private-database-details'); END");
  await s.call("POST", "/api/chats", { message: "private-prompt" });
  expect(JSON.stringify(errors.mock.calls)).not.toContain("private");
  expect(entries()).toContainEqual(expect.objectContaining({ event: "ai.action.failed", level: "warn" }));
});
