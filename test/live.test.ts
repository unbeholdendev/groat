import { afterEach, expect, test } from "bun:test";
import { websocket } from "hono/bun";
import { setup } from "./harness";

const cleanups: (() => void)[] = [];
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); });

async function received(messages: unknown[], count: number) {
  const deadline = Date.now() + 2000;
  while (messages.length < count && Date.now() < deadline) await Bun.sleep(5);
  expect(messages).toHaveLength(count);
}

function server() {
  const h = setup();
  h.db.run("INSERT INTO sessions (id, user_id, expires_at) VALUES ('live', 1, '9999')");
  const server = Bun.serve({ port: 0, fetch: h.app.fetch, websocket });
  cleanups.push(() => server.stop(true));
  const origin = server.url.origin;
  const connect = (cookie = "session=live") => {
    const ws = new (WebSocket as unknown as { new(url: string, options: Bun.WebSocketOptions): WebSocket })(origin.replace("http:", "ws:") + "/api/live", { headers: { cookie, origin } });
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

test("two clients receive invalidations and reconnect starts with catch-up", async () => {
  const h = server();
  const a = h.connect(), b = h.connect();
  await Promise.all([received(a.messages, 1), received(b.messages, 1)]);
  expect(a.messages[0]).toEqual({ type: "ready", username: "admin" });
  await h.call("POST", "/api/categories", { name: "Live", icon: "x", color: "#ff0000" });
  await Promise.all([received(a.messages, 2), received(b.messages, 2)]);
  expect(b.messages[1]).toEqual({ type: "invalidate" });
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
