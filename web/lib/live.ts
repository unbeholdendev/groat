import type { QueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { resource } from "../../shared/schema";
import { tab } from "./api";
import { invalidate } from "./resources";
import { session } from "./schemas";
import { stream } from "./streams";

const message = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ready"), username: z.string() }),
  z.object({ type: z.literal("changed"), resources: z.array(resource) }),
  z.object({ type: z.literal("heartbeat") }),
  z.object({ type: z.literal("chat"), id: z.number(), at: z.number().optional(), text: z.string().optional() }),
]);

export function liveUpdates(client: QueryClient, revoked: () => void) {
  let owner: string | undefined;
  let socket: WebSocket | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let heartbeat: ReturnType<typeof setTimeout> | undefined;
  let delay = 1000;
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
    url.searchParams.set("tab", tab);
    const current = new WebSocket(url);
    socket = current;
    const alive = () => {
      clearTimeout(heartbeat);
      heartbeat = setTimeout(() => current.close(), 30_000);
    };
    current.onopen = alive;
    current.onmessage = (event) => {
      if (socket !== current) return;
      let raw;
      try { raw = JSON.parse(event.data); } catch { return; }
      alive();
      const data = message.safeParse(raw).data;
      if (data?.type === "changed") void invalidate(client, data.resources);
      if (data?.type === "chat") {
        if (data.at !== undefined && data.text !== undefined) stream(data.id, data.at, data.text);
        else void client.invalidateQueries({ queryKey: [`/api/chats/${data.id}`], exact: true });
      }
      if (data?.type !== "ready") return;
      if (data.username !== owner) {
        owner = undefined;
        stop();
        revoked();
        return;
      }
      delay = 1000;
      void client.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/") });
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
    const next = session.safeParse(event.query.state.data).data?.user?.username;
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
