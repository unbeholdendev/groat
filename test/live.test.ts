import { afterEach, expect, test } from "bun:test";
import { websocket } from "hono/bun";
import { changed } from "../server/live";
import { models, setup } from "./harness";

const cleanups: (() => void)[] = [];
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); });

async function received(messages: unknown[], count: number) {
  const deadline = Date.now() + 2000;
  while (messages.length < count && Date.now() < deadline) await Bun.sleep(5);
  expect(messages).toHaveLength(count);
}

function server(...args: Parameters<typeof setup>) {
  const h = setup(...args);
  h.db.run("INSERT INTO sessions (id, user_id, expires_at) VALUES ('live', 1, '9999')");
  const server = Bun.serve({ port: 0, fetch: h.app.fetch, websocket });
  cleanups.push(() => server.stop(true));
  const origin = server.url.origin;
  const connect = (cookie = "session=live", tab = "", headers: Record<string, string> = {}) => {
    const ws = new (WebSocket as unknown as { new(url: string, options: Bun.WebSocketOptions): WebSocket })(origin.replace("http:", "ws:") + "/api/live?tab=" + tab, { headers: { cookie, origin, ...headers } });
    const messages: unknown[] = [];
    ws.onmessage = (e) => messages.push(JSON.parse(String(e.data)));
    cleanups.push(() => ws.close());
    return { ws, messages };
  };
  return { ...h, origin, connect };
}

test("live endpoint rejects anonymous and foreign origins", async () => {
  const h = server();
  expect((await fetch(h.origin + "/api/live", { headers: { origin: h.origin } })).status).toBe(401);
  expect((await fetch(h.origin + "/api/live", { headers: { cookie: "session=live", origin: "https://evil.test" } })).status).toBe(403);
  expect((await fetch(h.origin + "/api/live", { headers: { cookie: "session=live" } })).status).toBe(403);
});

test("writes name the resources they change", () => {
  expect(changed("/api/transactions")).toEqual(["transactions"]);
  expect(changed("/api/transactions/3/confirm")).toEqual(["transactions"]);
  expect(changed("/api/bin")).toEqual(["transactions"]);
  expect(changed("/api/tags/2")).toEqual(["transactions", "recurring"]);
  expect(changed("/api/categories/order")).toEqual(["categories", "transactions", "recurring"]);
  expect(changed("/api/settings")).toEqual(["settings", "transactions"]);
  expect(changed("/api/recurring/1/pause")).toEqual(["recurring", "transactions"]);
  expect(changed("/api/users/2/password")).toEqual(["members"]);
  expect(changed("/api/chatgpt/model")).toEqual(["ai"]);
  expect(changed("/api/login")).toEqual(["session"]);
  for (const path of ["/api/drafts", "/api/drafts/photo", "/api/voice", "/api/import/preview", "/api/password", "/api/logout"])
    expect(changed(path)).toEqual([]);
  expect(changed("/api/import")).toEqual(["transactions", "categories", "settings", "recurring", "members", "tokens", "ai", "session", "chats"]);
  expect(changed("/api/aiming")).toHaveLength(9);
});

test("other tabs hear a write, the sender's tab does not, and reconnect starts with catch-up", async () => {
  const h = server();
  const a = h.connect(undefined, "a"), b = h.connect(undefined, "b");
  await Promise.all([received(a.messages, 1), received(b.messages, 1)]);
  expect(a.messages[0]).toEqual({ type: "ready", username: "admin" });
  await h.request("/api/categories", { method: "POST", headers: { "content-type": "application/json", "x-tab": "a" }, body: JSON.stringify({ name: "Live", icon: "x", color: "#ff0000" }) });
  await received(b.messages, 2);
  expect(b.messages[1]).toEqual({ type: "changed", resources: ["categories", "transactions", "recurring"] });
  await h.call("POST", "/api/transactions", { note: "Untabbed", amount: "1" });
  await Promise.all([received(a.messages, 2), received(b.messages, 3)]);
  expect(a.messages[1]).toEqual({ type: "changed", resources: ["transactions"] });
  h.app.generate();
  await received(b.messages, 4);
  expect(b.messages[3]).toEqual({ type: "changed", resources: ["recurring", "transactions"] });
  b.ws.close();
  await h.call("POST", "/api/categories", { name: "Missed", icon: "x", color: "#ff0000" });
  const reconnected = h.connect();
  await received(reconnected.messages, 1);
  expect(reconnected.messages[0]).toEqual({ type: "ready", username: "admin" });
  expect(JSON.stringify((await h.call("GET", "/api/categories")).body)).toContain("Missed");
});

test("revocation closes sockets before broadcasting further updates", async () => {
  const h = server();
  const client = h.connect();
  await received(client.messages, 1);
  const closed = new Promise<number>((resolve) => client.ws.onclose = (e) => resolve(e.code));
  h.db.run("DELETE FROM sessions WHERE id = 'live'");
  await h.call("POST", "/api/categories", { name: "Private", icon: "x", color: "#ff0000" });
  expect(await closed).toBe(4001);
  expect(client.messages).toHaveLength(1);
});

test("expired and deleted users cannot connect", async () => {
  const h = server();
  h.db.run("UPDATE sessions SET expires_at = '2000' WHERE id = 'live'");
  expect((await fetch(h.origin + "/api/live", { headers: { origin: h.origin, cookie: "session=live" } })).status).toBe(401);
  h.db.run("UPDATE sessions SET expires_at = '9999'");
  h.db.run("UPDATE users SET deleted_at = '2026-01-01'");
  expect((await fetch(h.origin + "/api/live", { headers: { origin: h.origin, cookie: "session=live" } })).status).toBe(401);
});

test("chat publishes saved conversations separately from ledger actions", async () => {
  const replies: Record<string, unknown>[] = [
    { content: "About £40." },
    { tool_calls: [{ id: "add", type: "function", function: { name: "add_transaction", arguments: JSON.stringify({ note: "Lunch", amount: "12" }) } }] },
    { content: "Added." },
  ];
  const listed = models(["test-model"]);
  const ai = (url: URL) => url.href === "https://ai.test/v1/chat/completions"
    ? Response.json({ choices: [{ message: { role: "assistant", content: null, ...replies.shift() } }] })
    : listed(url);
  const h = server(undefined, ai, { baseUrl: "https://ai.test/v1", key: "sk-test" });
  const client = h.connect(undefined, "a");
  await received(client.messages, 1);
  expect((await h.call("POST", "/api/chats", { message: "How much on food?" })).status).toBe(201);
  expect((await h.call("POST", "/api/chats", { message: "Add lunch for 12" })).status).toBe(201);
  await received(client.messages, 4);
  expect(client.messages.slice(1)).toEqual([
    { type: "changed", resources: ["chats"] },
    { type: "changed", resources: ["transactions"] },
    { type: "changed", resources: ["chats"] },
  ]);
});

test("deleting a saved chat notifies other tabs without refreshing the ledger", async () => {
  const h = server();
  h.db.run("INSERT INTO chats (id, title) VALUES (1, 'Saved')");
  const client = h.connect();
  await received(client.messages, 1);
  expect((await h.call("DELETE", "/api/chats/1")).status).toBe(200);
  await received(client.messages, 2);
  expect(client.messages[1]).toEqual({ type: "changed", resources: ["chats"] });
});

test("deleting a category tells other clients to refresh recurring schedules", async () => {
  const h = server();
  const category = await h.call("POST", "/api/categories", { name: "Temporary", icon: "x", color: "#ff0000" });
  const client = h.connect();
  await received(client.messages, 1);
  expect((await h.call("DELETE", `/api/categories/${category.body.id}`)).status).toBe(200);
  await received(client.messages, 2);
  expect(client.messages[1]).toEqual({ type: "changed", resources: ["categories", "transactions", "recurring"] });
});

for (const [forwarded, scheme] of [["ws", "http"], ["wss", "https"], ["http", "http"], ["https", "https"]]) {
  test(`live connections accept matching origins behind a ${forwarded} proxy`, async () => {
    const h = server();
    const origin = scheme + "://" + new URL(h.origin).host;
    const client = h.connect(undefined, "", { origin, "x-forwarded-proto": forwarded });
    await received(client.messages, 1);
    expect(client.messages[0]).toEqual({ type: "ready", username: "admin" });
    for (const rejected of ["https://evil.test", (scheme === "https" ? "http" : "https") + "://" + new URL(h.origin).host]) {
      expect((await fetch(h.origin + "/api/live", { headers: { origin: rejected, cookie: "session=live", "x-forwarded-proto": forwarded } })).status).toBe(403);
    }
  });
}
