import { Database } from "bun:sqlite";
import { serveStatic } from "hono/bun";
import { createApp } from "../server/app";
import { frankfurter, mempool } from "../test/harness";

const rates = frankfurter({ "2000-01-01": { EUR: 0.9, GBP: 0.8, USD: 1 } });
const btc = mempool({ "2000-01-01": 60000 });

function provider(url: URL, init?: RequestInit) {
  if (url.host !== "ai.test") return;
  const body = JSON.parse(String(init?.body));
  const last = body.messages.at(-1).content;
  const message = body.tool_choice
    ? { content: null, tool_calls: [{ id: "x", type: "function", function: { name: "transaction", arguments: JSON.stringify({ note: typeof last === "string" ? last.replace(/[\d.]+/g, "").trim() : "Corner shop", amount: "9.99" }) } }] }
    : { content: "Mostly on food." };
  return Response.json({ choices: [{ message: { role: "assistant", ...message } }] });
}

function build(ai = false) {
  const app = createApp({
    db: new Database(":memory:"),
    clock: () => new Date(),
    fetch: async (input, init) => {
      const url = new URL(String(input));
      return rates(url) ?? btc(url) ?? provider(url, init) ?? new Response("not found", { status: 404 });
    },
    config: !ai ? {} : { aiBaseUrl: "https://ai.test/v1", aiApiKey: "k", aiModel: "m", aiVisionModel: "m" },
  });
  app.use("*", serveStatic({ root: "./dist" }));
  app.get("*", serveStatic({ path: "./dist/index.html" }));
  return app;
}

let app = build();

export default {
  port: Number(process.env.PORT ?? 3100),
  fetch: (req: Request) => {
    const url = new URL(req.url);
    return url.pathname === "/__reset" ? ((app = build(url.searchParams.has("ai"))), new Response("ok")) : app.fetch(req);
  },
};
