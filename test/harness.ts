import { Database } from "bun:sqlite";
import { createApp } from "../server/app";
import { hashCost } from "../server/auth/access";

type Handler = (url: URL, init?: RequestInit) => Response | undefined | Promise<Response>;

export function completion(message: {
  role?: string;
  content?: string | null;
  tool_calls?: { id: string; type?: string; function: { name: string; arguments: string } }[];
}) {
  const chunks: unknown[] = [];
  const chunk = (delta: object, finish_reason: string | null = null) =>
    chunks.push({
      id: "chatcmpl-test",
      object: "chat.completion.chunk",
      created: 0,
      model: "test-model",
      choices: [{ index: 0, delta, finish_reason }],
    });
  const parts = (value: string) => [
    value.slice(0, Math.ceil(value.length / 2)),
    value.slice(Math.ceil(value.length / 2)),
  ];
  chunk({ role: "assistant", content: "" });
  if (typeof message.content === "string") for (const content of parts(message.content)) chunk({ content });
  for (const [index, call] of (message.tool_calls ?? []).entries()) {
    chunk({
      tool_calls: [{ index, id: call.id, type: "function", function: { name: call.function.name, arguments: "" } }],
    });
    for (const args of parts(call.function.arguments))
      chunk({ tool_calls: [{ index, function: { arguments: args } }] });
  }
  chunk({}, message.tool_calls?.length ? "tool_calls" : "stop");
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const data of chunks) controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );
}

export function frankfurter(rates: Record<string, Record<string, number>>): Handler {
  return (url) => {
    if (url.host !== "api.frankfurter.dev") return;
    const day = new Date(url.searchParams.get("date")!);
    while (!rates[day.toISOString().slice(0, 10)] && day > new Date("2000-01-01")) day.setUTCDate(day.getUTCDate() - 1);
    const date = day.toISOString().slice(0, 10);
    const quotes = url.searchParams
      .get("quotes")!
      .split(",")
      .filter((q) => rates[date]?.[q]);
    return Response.json(quotes.map((quote) => ({ date, base: "USD", quote, rate: rates[date][quote] })));
  };
}

export function mempool(usd: Record<string, number>): Handler {
  return (url) => {
    if (url.host !== "mempool.space" || url.pathname !== "/api/v1/historical-price") return;
    const at = Number(url.searchParams.get("timestamp")) * 1000;
    const prices = Object.entries(usd)
      .map(([date, USD]) => ({ time: Date.parse(date) / 1000, USD }))
      .filter((p) => p.time * 1000 <= at)
      .sort((a, b) => b.time - a.time)
      .slice(0, 1);
    return Response.json({ prices, exchangeRates: { USDEUR: 0.92, USDGBP: 0.78 } });
  };
}

export function models(ids: (string | object)[], base = "https://ai.test/v1"): Handler {
  return (url) =>
    url.href === `${base}/models`
      ? Response.json({ object: "list", data: ids.map((m) => (typeof m === "string" ? { id: m } : m)) })
      : undefined;
}

type Called = { status: number; body: any };

export function settling<A extends unknown[]>(
  call: (method: string, path: string, body?: unknown, ...rest: A) => Promise<Called>,
) {
  return async (method: string, path: string, body?: unknown, ...rest: A): Promise<Called> => {
    const res = await call(method, path, body, ...rest);
    if (res.status !== 202 || !res.body.running) return res;
    for (;;) {
      const chat = await call("GET", `/api/chats/${res.body.id}`, undefined, ...rest);
      if (!chat.body.running) return { status: res.status, body: chat.body };
      await Bun.sleep(1);
    }
  };
}

export type Ai = { baseUrl?: string; key?: string; sttBaseUrl?: string; sttKey?: string };

export function setup(now = "2026-10-10T12:00:00Z", handler: Handler = () => undefined, ai: Ai = {}) {
  const clock = { now: new Date(now) };
  const fetches: string[] = [];
  const db = new Database(":memory:");
  const build = () =>
    createApp({
      db,
      clock: () => clock.now,
      fetch: async (input, init) => {
        fetches.push(String(input));
        return (await handler(new URL(String(input)), init)) ?? new Response("not found", { status: 404 });
      },
    });
  let app = build();
  db.run("UPDATE settings SET ai_base_url = ?, ai_key = ?, stt_base_url = ?, stt_key = ?", [
    ai.baseUrl ?? null,
    ai.key ?? null,
    ai.sttBaseUrl ?? null,
    ai.sttKey ?? null,
  ]);
  db.run("INSERT INTO users (username, password_hash, role) VALUES ('admin', ?, 'admin')", [
    Bun.password.hashSync("secret", hashCost),
  ]);
  const restart = () => (app = build());
  const request = (path: string, init: RequestInit = {}) => {
    db.run("INSERT OR REPLACE INTO sessions (id, user_id, expires_at) VALUES ('admin', 1, '9999')");
    return app.request(path, { ...init, headers: { cookie: "session=admin", ...init.headers } });
  };
  const call = settling(async (method: string, path: string, body?: unknown) => {
    const res = await request(path, {
      method,
      headers: body ? { "content-type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json() };
  });
  return { app, db, clock, fetches, call, request, restart };
}
