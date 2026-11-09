import type { Database } from "bun:sqlite";
import { Hono } from "hono";
import { upgradeWebSocket } from "hono/bun";
import { getCookie } from "hono/cookie";
import type { WSContext } from "hono/ws";

export function liveUpdates(db: Database, clock: () => Date) {
  const app = new Hono();
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
  }, upgradeWebSocket((c) => {
    const id = getCookie(c, "session") ?? "";
    let connection: WSContext | undefined;
    return {
      onOpen(_, ws) {
        const user = valid(id);
        if (!user) return ws.close(4001, "Session ended");
        connection = ws;
        clients.set(ws, id);
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
        if (!clients.size) { clearInterval(timer); timer = undefined; }
      },
    };
  }));
  return { routes: app, publish };
}
