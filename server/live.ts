import type { Database } from "bun:sqlite";
import { Hono } from "hono";
import { getBunServer, type BunWebSocketData } from "hono/bun";
import { getCookie } from "hono/cookie";
import type { WSContext, WSEvents } from "hono/ws";
import { log, type RequestEnv } from "./logging";

export function liveUpdates(db: Database, clock: () => Date) {
  const app = new Hono<RequestEnv>();
  const clients = new Map<WSContext, string>();
  let timer: ReturnType<typeof setInterval> | undefined;
  const valid = (id: string) => db.query(`SELECT users.username FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.id = ? AND sessions.expires_at > ? AND users.deleted_at IS NULL`).get(id, clock().toISOString()) as { username: string } | null;
  const publish = () => {
    for (const [ws, id] of clients) {
      if (!valid(id)) {
        clients.delete(ws);
        ws.close(4001, "Session ended");
      } else ws.send(JSON.stringify({ type: "invalidate" }));
    }
  };
  app.get("/api/live", (c, next) => {
    const origin = c.req.header("origin");
    const url = new URL(c.req.url);
    const protocol = c.req.header("x-forwarded-proto") ?? url.protocol.slice(0, -1);
    if (!origin || origin !== `${protocol}://${url.host}`) return c.json({ error: "Forbidden" }, 403);
    if (!valid(getCookie(c, "session") ?? "")) return c.json({ error: "Sign in first" }, 401);
    return next();
  }, (c, next) => {
    const id = getCookie(c, "session") ?? "";
    let connection: WSContext | undefined;
    const events: WSEvents = {
      onOpen(_, ws) {
        const user = valid(id);
        if (!user) return ws.close(4001, "Session ended");
        connection = ws;
        clients.set(ws, id);
        log("debug", "live.connected", { count: clients.size });
        ws.send(JSON.stringify({ type: "ready", username: user.username }));
        timer ??= setInterval(() => {
          for (const [socket, session] of clients) {
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
  return { routes: app, publish, close };
}
