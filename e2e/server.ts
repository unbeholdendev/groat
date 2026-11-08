import { Database } from "bun:sqlite";
import { serveStatic } from "hono/bun";
import { createApp } from "../server/app";
import { frankfurter, mempool } from "../test/harness";

const rates = frankfurter({ "2000-01-01": { EUR: 0.9, GBP: 0.8, USD: 1 } });
const btc = mempool({ "2000-01-01": 60000 });

function provider(url: URL, init: RequestInit | undefined, models: string[]) {
  if (url.host !== "ai.test") return;
  if (new Headers(init?.headers).get("authorization") !== "Bearer sk-e2e-key-0000") return Response.json({ error: "bad key" }, { status: 401 });
  if (url.pathname === "/v1/models") return Response.json({ object: "list", data: models.map((id) => ({ id })) });
  const body = JSON.parse(String(init?.body));
  const last = body.messages.at(-1).content;
  const message = body.tool_choice
    ? { content: null, tool_calls: [{ id: "x", type: "function", function: { name: "transaction", arguments: JSON.stringify({ note: typeof last === "string" ? last.replace(/[\d.]+/g, "").trim() : "Corner shop", amount: "9.99" }) } }] }
    : { content: "Mostly on food." };
  return Response.json({ choices: [{ message: { role: "assistant", ...message } }] });
}

function build(models?: string[]) {
  const db = new Database(":memory:");
  const app = createApp({
    db,
    clock: () => new Date(),
    fetch: async (input, init) => {
      const url = new URL(String(input));
      return rates(url) ?? btc(url) ?? provider(url, init, models ?? ["gpt-4o-mini", "whisper-1"]) ?? new Response("not found", { status: 404 });
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
  fetch: (req: Request) => {
    const url = new URL(req.url);
    return url.pathname === "/__reset" ? ((app = build(url.searchParams.get("ai")?.split(",").filter(Boolean))), new Response("ok")) : app.fetch(req);
  },
};
