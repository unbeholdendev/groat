import type { Database } from "bun:sqlite";
import { Hono, type MiddlewareHandler } from "hono";
import { getBunServer, type BunWebSocketData } from "hono/bun";
import { getCookie } from "hono/cookie";
import type { WSContext, WSEvents } from "hono/ws";
import { type Resource, resource } from "../shared/schema";
import { log, type RequestEnv } from "./logging";

const changes: [string, Resource[]][] = [
  ["/api/transactions", ["transactions"]],
  ["/api/bin", ["transactions"]],
  ["/api/tags", ["transactions", "recurring"]],
  ["/api/capture", ["transactions"]],
  ["/api/categories", ["categories", "transactions", "recurring"]],
  ["/api/settings", ["settings", "transactions"]],
  ["/api/onboarding", ["settings", "categories"]],
  ["/api/recurring", ["recurring", "transactions"]],
  ["/api/users", ["members"]],
  ["/api/tokens", ["tokens"]],
  ["/api/ai", ["ai"]],
  ["/api/models", ["ai"]],
  ["/api/chatgpt", ["ai"]],
  ["/api/import/preview", []],
  ["/api/chats", ["chats"]],
  ["/api/drafts", []],
  ["/api/voice", []],
  ["/api/password", []],
  ["/api/login", ["session"]],
  ["/api/setup", ["session"]],
  ["/api/logout", []],
];

// Unlisted writes, such as import and restore, name everything so a new route can't go stale.
export const changed = (path: string): readonly Resource[] =>
  changes.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`))?.[1] ?? resource.options;

export function liveUpdates(db: Database, clock: () => Date) {
  const app = new Hono<RequestEnv>();
  const clients = new Map<WSContext, { session: string; tab?: string }>();
  let timer: ReturnType<typeof setInterval> | undefined;
  const valid = (id: string) => db.query(`SELECT users.username FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.id = ? AND sessions.expires_at > ? AND users.deleted_at IS NULL`).get(id, clock().toISOString()) as { username: string } | null;
  const publish = (resources: readonly Resource[], tab?: string) => {
    for (const [ws, client] of clients) {
      if (!valid(client.session)) {
        clients.delete(ws);
        ws.close(4001, "Session ended");
      } else if (resources.length && (!tab || client.tab !== tab)) ws.send(JSON.stringify({ type: "changed", resources }));
    }
  };
  const publishChanges: MiddlewareHandler = async (c, next) => {
    await next();
    if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method) && c.res.ok) publish(changed(c.req.path), c.req.header("x-tab"));
  };
  app.get("/api/live", (c, next) => {
    const origin = c.req.header("origin");
    const url = new URL(c.req.url);
    const forwarded = c.req.header("x-forwarded-proto") ?? url.protocol.slice(0, -1);
    const protocol = forwarded === "wss" ? "https" : forwarded === "ws" ? "http" : forwarded;
    if (!origin || origin !== `${protocol}://${url.host}`) return c.json({ error: "Forbidden" }, 403);
    if (!valid(getCookie(c, "session") ?? "")) return c.json({ error: "Sign in first" }, 401);
    return next();
  }, (c, next) => {
    const id = getCookie(c, "session") ?? "";
    const tab = c.req.query("tab");
    let connection: WSContext | undefined;
    const events: WSEvents = {
      onOpen(_, ws) {
        const user = valid(id);
        if (!user) return ws.close(4001, "Session ended");
        connection = ws;
        clients.set(ws, { session: id, tab });
        log("debug", "live.connected", { count: clients.size });
        ws.send(JSON.stringify({ type: "ready", username: user.username }));
        timer ??= setInterval(() => {
          for (const [socket, { session }] of clients) {
            if (!valid(session)) {
              clients.delete(socket);
              socket.close(4001, "Session ended");
            } else socket.send(JSON.stringify({ type: "heartbeat" }));
          }
          if (!clients.size) { clearInterval(timer); timer = undefined; }
        }, 10_000);
        timer.unref();
      },
      onClose() {
        if (connection) clients.delete(connection);
        log("debug", "live.disconnected", { count: clients.size });
        if (!clients.size) { clearInterval(timer); timer = undefined; }
      },
      onError() { log("warn", "live.failed"); },
    };
    const server = getBunServer<Bun.Server<BunWebSocketData>>(c);
    if (!server) throw new TypeError("env has to include the 2nd argument of fetch.");
    if (!server.upgrade(c.req.raw, {
      headers: { "x-request-id": c.get("requestId") },
      data: { events, url: new URL(c.req.url), protocol: c.req.header("sec-websocket-protocol")?.split(",")[0]?.trim() ?? "" },
    })) return next();
    c.set("websocketUpgraded", true);
    return new Response(null);
  });
  const close = () => {
    clearInterval(timer);
    timer = undefined;
    for (const ws of clients.keys()) ws.close(1001, "Server shutting down");
    clients.clear();
  };
  return { routes: app, publish, publishChanges, close };
}
