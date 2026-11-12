import { Database } from "bun:sqlite";
import { serveStatic, websocket } from "hono/bun";
import { createApp } from "../server/app";
import { completion, frankfurter, mempool } from "../test/harness";

const rates = frankfurter({ "2000-01-01": { EUR: 0.9, GBP: 0.8, USD: 1 } });
const btc = mempool({ "2000-01-01": 60000 });

let release = () => {};
let gate = Promise.resolve();
const held = (signal?: AbortSignal | null) =>
  new Promise<void>((resolve, reject) => {
    void gate.then(resolve);
    signal?.addEventListener("abort", () => reject(signal.reason));
  });
const add = (id: string, note: string) => ({
  role: "assistant",
  content: null,
  tool_calls: [
    {
      id,
      type: "function",
      function: { name: "add_transaction", arguments: JSON.stringify({ note, amount: "3", currency: "GBP" }) },
    },
  ],
});

function provider(url: URL, init: RequestInit | undefined, models: string[]) {
  if (url.host !== "ai.test") return;
  if (new Headers(init?.headers).get("authorization") !== "Bearer sk-e2e-key-0000")
    return Response.json({ error: "bad key" }, { status: 401 });
  if (url.pathname === "/v1/models") return Response.json({ object: "list", data: models.map((id) => ({ id })) });
  const body = JSON.parse(String(init?.body));
  const last = body.messages.at(-1).content;
  if (
    !body.tool_choice &&
    body.messages.findLast((m: { role: string }) => m.role === "user")?.content === "Add test coffee for £3"
  ) {
    const message =
      body.messages.at(-1).role === "tool"
        ? { role: "assistant", content: "Added test coffee." }
        : {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "coffee",
                type: "function",
                function: {
                  name: "add_transaction",
                  arguments: JSON.stringify({ note: "Test coffee", amount: "3", currency: "GBP" }),
                },
              },
            ],
          };
    return completion(message);
  }
  if (body.messages.findLast((m: { role: string }) => m.role === "user")?.content === "Add two slow coffees") {
    const done = body.messages.filter((m: { role: string }) => m.role === "tool").length;
    if (done === 0) return completion(add("slow-1", "Slow coffee"));
    if (done === 1) return held(init?.signal).then(() => completion(add("slow-2", "Second slow coffee")));
    return completion({ role: "assistant", content: "Added both slow coffees." });
  }
  if (last === "Show raw results")
    return completion({ role: "assistant", content: JSON.stringify({ id: "a".repeat(120) }) });
  const message = body.tool_choice
    ? {
        content: null,
        tool_calls: [
          {
            id: "x",
            type: "function",
            function: {
              name: "transaction",
              arguments: JSON.stringify({
                note: typeof last === "string" ? last.replace(/[\d.]+/g, "").trim() : "Corner shop",
                amount: "9.99",
              }),
            },
          },
        ],
      }
    : { content: "Mostly on food." };
  return completion({ role: "assistant", ...message });
}

function build(models?: string[]) {
  gate = new Promise((resolve) => {
    release = resolve;
  });
  const db = new Database(":memory:");
  const app = createApp({
    db,
    clock: () => new Date(),
    fetch: async (input, init) => {
      const url = new URL(String(input));
      return (
        rates(url) ??
        btc(url) ??
        provider(url, init, models ?? ["gpt-4o-mini", "whisper-1"]) ??
        new Response("not found", { status: 404 })
      );
    },
  });
  if (models) db.run("UPDATE settings SET ai_base_url = 'https://ai.test/v1', ai_key = 'sk-e2e-key-0000'");
  app.use("*", serveStatic({ root: "./dist" }));
  app.get("*", serveStatic({ path: "./dist/index.html" }));
  return app;
}

let app = build();

export default {
  port: Number(process.env.PORT ?? 3100),
  websocket,
  fetch: (req: Request, server: Parameters<typeof app.fetch>[1]) => {
    const url = new URL(req.url);
    if (url.pathname === "/__release") return (release(), new Response("ok"));
    return url.pathname === "/__reset"
      ? ((app = build(url.searchParams.get("ai")?.split(",").filter(Boolean))), new Response("ok"))
      : app.fetch(req, server);
  },
};
