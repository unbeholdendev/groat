import type { QueryClient } from "@tanstack/react-query";

export function liveUpdates(client: QueryClient, revoked: () => void) {
  let owner: string | undefined;
  let socket: WebSocket | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let heartbeat: ReturnType<typeof setTimeout> | undefined;
  let delay = 1000;
  const refresh = () => void client.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/") });
  const stop = () => {
    clearTimeout(retry);
    clearTimeout(heartbeat);
    const previous = socket;
    socket = undefined;
    previous?.close();
  };
  const connect = () => {
    if (!owner || socket) return;
    const url = new URL("/api/live", location.href);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const current = new WebSocket(url);
    socket = current;
    const alive = () => {
      clearTimeout(heartbeat);
      heartbeat = setTimeout(() => current.close(), 30_000);
    };
    current.onopen = alive;
    current.onmessage = (event) => {
      if (socket !== current) return;
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      alive();
      if (message.type === "ready" && message.username !== owner) {
        owner = undefined;
        stop();
        revoked();
        return;
      }
      if (message.type === "ready") delay = 1000;
      if (message.type === "ready" || message.type === "invalidate") refresh();
    };
    current.onclose = (event) => {
      if (socket !== current) return;
      socket = undefined;
      clearTimeout(heartbeat);
      if (event.code === 4001) {
        owner = undefined;
        revoked();
        return;
      }
      void client.invalidateQueries({ queryKey: ["/api/session"] });
      retry = setTimeout(connect, delay);
      delay = Math.min(delay * 2, 30_000);
    };
  };
  const unsubscribe = client.getQueryCache().subscribe((event) => {
    if (event.type !== "updated" || event.action.type !== "success" || event.query.queryKey[0] !== "/api/session") return;
    const next = (event.query.state.data as { user?: { username: string } | null })?.user?.username;
    if (owner === next) return;
    const ended = !!owner && !next;
    owner = next;
    stop();
    if (ended) revoked();
    delay = 1000;
    connect();
  });
  const online = () => { if (!socket) { clearTimeout(retry); connect(); } };
  window.addEventListener("online", online);
  return () => { owner = undefined; stop(); unsubscribe(); window.removeEventListener("online", online); };
}
