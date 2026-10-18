import { Database } from "bun:sqlite";
import { createApp, type Deps } from "../server/app";
import { hashCost } from "../server/auth";

type Handler = (url: URL, init?: RequestInit) => Response | undefined;

export function frankfurter(rates: Record<string, Record<string, number>>): Handler {
  return (url) => {
    if (url.host !== "api.frankfurter.dev") return;
    const day = new Date(url.searchParams.get("date")!);
    while (!rates[day.toISOString().slice(0, 10)] && day > new Date("2000-01-01")) day.setUTCDate(day.getUTCDate() - 1);
    const date = day.toISOString().slice(0, 10);
    const quotes = url.searchParams.get("quotes")!.split(",").filter((q) => rates[date]?.[q]);
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

export function setup(now = "2026-10-10T12:00:00Z", handler: Handler = () => undefined, config: Deps["config"] = {}) {
  const clock = { now: new Date(now) };
  const fetches: string[] = [];
  const db = new Database(":memory:");
  const build = () =>
    createApp({
      db,
      clock: () => clock.now,
      fetch: async (input, init) => {
        fetches.push(String(input));
        return handler(new URL(String(input)), init) ?? new Response("not found", { status: 404 });
      },
      config,
    });
  let app = build();
  db.run("INSERT INTO users (username, password_hash, role) VALUES ('admin', ?, 'admin')", [Bun.password.hashSync("secret", hashCost)]);
  const restart = () => (app = build());
  const request = (path: string, init: RequestInit = {}) => {
    db.run("INSERT OR REPLACE INTO sessions (id, user_id, expires_at) VALUES ('admin', 1, '9999')");
    return app.request(path, { ...init, headers: { cookie: "session=admin", ...init.headers } });
  };
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await request(path, {
      method,
      headers: body ? { "content-type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json() };
  };
  return { app, db, clock, fetches, call, request, restart };
}
