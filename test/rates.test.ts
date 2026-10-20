import { expect, test } from "bun:test";
import { frankfurter, mempool, setup } from "./harness";

const rates = {
  "2026-10-01": { EUR: 0.9, GBP: 0.72, JPY: 150 },
  "2026-10-02": { EUR: 0.8, GBP: 0.76, JPY: 160 },
};

async function onboarded(baseCurrency: string, handler = frankfurter(rates)) {
  const t = setup("2026-10-10T12:00:00Z", handler);
  await t.call("POST", "/api/onboarding", { baseCurrency });
  return t;
}

test("an EUR expense shows its GBP value at the rate for its date", async () => {
  const { call } = await onboarded("GBP");
  await call("POST", "/api/expenses", { note: "Lunch", amount: "10.00", currency: "EUR", date: "2026-10-02" });
  const [lunch] = (await call("GET", "/api/expenses")).body;
  expect(lunch).toMatchObject({ amount: 1000, currency: "EUR", baseAmount: 950 });
});

test("only missing rates are fetched, then reused", async () => {
  const { call, fetches } = await onboarded("GBP");
  await call("POST", "/api/expenses", { note: "a", amount: "1", currency: "EUR", date: "2026-10-02" });
  await call("POST", "/api/expenses", { note: "b", amount: "100", currency: "JPY", date: "2026-10-02" });
  await call("POST", "/api/expenses", { note: "c", amount: "1", currency: "EUR", date: "2026-10-02" });
  await call("GET", "/api/expenses");
  await call("GET", "/api/expenses");
  expect(fetches).toEqual([
    "https://api.frankfurter.dev/v2/rates?date=2026-10-02&base=USD&quotes=EUR,GBP",
    "https://api.frankfurter.dev/v2/rates?date=2026-10-02&base=USD&quotes=JPY",
  ]);
});

test("weekend dates use the prior business day's rate", async () => {
  const { call, fetches } = await onboarded("GBP");
  await call("POST", "/api/expenses", { note: "Brunch", amount: "10", currency: "EUR", date: "2026-10-04" });
  const [brunch] = (await call("GET", "/api/expenses")).body;
  expect(brunch.baseAmount).toBe(950);
  expect(fetches).toEqual(["https://api.frankfurter.dev/v2/rates?date=2026-10-04&base=USD&quotes=EUR,GBP"]);
});

test("changing base currency re-denominates history, fetching only the new base", async () => {
  const { call, fetches } = await onboarded("GBP");
  await call("POST", "/api/expenses", { note: "a", amount: "10", currency: "EUR", date: "2026-10-02" });
  await call("POST", "/api/expenses", { note: "b", amount: "1000", currency: "JPY", date: "2026-10-01" });
  await call("GET", "/api/expenses");
  const before = fetches.length;
  await call("PUT", "/api/settings", { baseCurrency: "EUR" });
  expect((await call("GET", "/api/expenses")).body.map((e: { baseAmount: number }) => e.baseAmount)).toEqual([1000, 600]);
  await call("PUT", "/api/settings", { baseCurrency: "JPY" });
  expect((await call("GET", "/api/expenses")).body.map((e: { baseAmount: number }) => e.baseAmount)).toEqual([2000, 1000]);
  expect(fetches.slice(before)).toEqual([
    "https://api.frankfurter.dev/v2/rates?date=2026-10-01&base=USD&quotes=EUR",
    "https://api.frankfurter.dev/v2/rates?date=2026-10-02&base=USD&quotes=JPY",
  ]);
});

test("zero-decimal currencies convert in whole units", async () => {
  const { call } = await onboarded("GBP");
  const ramen = await call("POST", "/api/expenses", { note: "Ramen", amount: "1600", currency: "JPY", date: "2026-10-02" });
  expect(ramen.body.amount).toBe(1600);
  expect((await call("GET", "/api/expenses")).body[0]).toMatchObject({ amount: 1600, currency: "JPY", baseAmount: 760 });
  await call("PUT", "/api/settings", { baseCurrency: "JPY" });
  await call("POST", "/api/expenses", { note: "Tea", amount: "2.50", currency: "GBP", date: "2026-10-01" });
  expect((await call("GET", "/api/expenses")).body[1]).toMatchObject({ amount: 250, currency: "GBP", baseAmount: 521 });
});

test("today's rates are reused for ten minutes, never stored", async () => {
  const fiat = frankfurter(rates);
  const btc = mempool({ "2026-10-01": 50_000 });
  const { call, fetches, clock, db } = await onboarded("GBP", (url) => fiat(url) ?? btc(url));
  await call("POST", "/api/expenses", { note: "a", amount: "10", currency: "EUR", date: "2026-10-10" });
  await call("POST", "/api/expenses", { note: "b", amount: "0.001", currency: "BTC", date: "2026-10-10" });
  expect((await call("GET", "/api/expenses")).body.map((e: { baseAmount: number }) => e.baseAmount)).toEqual([3800, 950]);
  await call("GET", "/api/stats?from=2026-10-01&to=2026-10-10&group=month");
  expect(fetches.length).toBe(2);
  expect(db.query("SELECT * FROM rates WHERE date = '2026-10-10'").all()).toEqual([]);
  clock.now = new Date("2026-10-10T12:11:00Z");
  await call("GET", "/api/expenses");
  expect(fetches.length).toBe(4);
});

test("a failed fetch is not retried until restart", async () => {
  const { call, fetches, restart } = await onboarded("GBP", () => new Response("down", { status: 503 }));
  await call("POST", "/api/expenses", { note: "Lunch", amount: "10", currency: "EUR", date: "2026-10-02" });
  await call("GET", "/api/expenses");
  expect((await call("GET", "/api/expenses")).body[0].baseAmount).toBeNull();
  expect(fetches.length).toBe(1);
  restart();
  await call("GET", "/api/expenses");
  expect(fetches.length).toBe(2);
});

test("adding or editing a foreign expense answers with its base value", async () => {
  const { call } = await onboarded("GBP");
  const added = await call("POST", "/api/expenses", { note: "Lunch", amount: "10.00", currency: "EUR", date: "2026-10-02" });
  expect(added.body.baseAmount).toBe(950);
  const edited = await call("PUT", `/api/expenses/${added.body.id}`, { note: "Lunch", amount: "20.00", currency: "EUR", date: "2026-10-02" });
  expect(edited.body.baseAmount).toBe(1900);
});

test("an unreachable rate source does not hold up saving", async () => {
  const hang = (url: URL, init?: RequestInit) =>
    url.host === "mempool.space" ? new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason))) : undefined;
  const { call } = await onboarded("GBP", hang);
  const saved = await call("POST", "/api/expenses", { note: "Pizza", amount: "0.0001", currency: "BTC", date: "2026-10-02" });
  expect(saved).toMatchObject({ status: 201, body: { baseAmount: null } });
});

test("BTC falls back to Coinbase when mempool.space has no price, and only then", async () => {
  const coinbase = (url: URL) => (url.host === "api.coinbase.com" ? Response.json({ data: { amount: "100000.00", base: "BTC", currency: "USD" } }) : undefined);
  const down = await onboarded("GBP", (url) => frankfurter(rates)(url) ?? coinbase(url));
  const pizza = await down.call("POST", "/api/expenses", { note: "Pizza", amount: "0.0001", currency: "BTC", date: "2026-10-02" });
  expect(pizza.body.baseAmount).toBe(760);
  expect(down.fetches).toContain("https://api.coinbase.com/v2/prices/BTC-USD/spot?date=2026-10-02");

  const up = await onboarded("GBP", (url) => frankfurter(rates)(url) ?? mempool({ "2026-10-02": 100000 })(url) ?? coinbase(url));
  await up.call("POST", "/api/expenses", { note: "Pizza", amount: "0.0001", currency: "BTC", date: "2026-10-02" });
  expect(up.fetches.some((f) => f.includes("coinbase"))).toBe(false);
});

test("a missing rate for today is not refetched on every request", async () => {
  const { call, fetches } = await onboarded("GBP", () => new Response("down", { status: 503 }));
  await call("POST", "/api/expenses", { note: "Pizza", amount: "0.0001", currency: "BTC", date: "2026-10-10" });
  const after = fetches.length;
  await call("GET", "/api/expenses");
  await call("GET", "/api/stats?from=2026-10-01&to=2026-10-10&group=month");
  expect(fetches.length).toBe(after);
});

test("a missing rate for today is not refetched while another currency is", async () => {
  const fiat = frankfurter({ "2026-10-10": { EUR: 0.9, GBP: 0.75 } });
  const { call, fetches, clock } = await onboarded("GBP", (url) => fiat(url) ?? new Response("down", { status: 503 }));
  await call("POST", "/api/expenses", { note: "Lunch", amount: "10", currency: "EUR", date: "2026-10-10" });
  clock.now = new Date("2026-10-10T12:11:00Z");
  await call("POST", "/api/expenses", { note: "Pizza", amount: "0.0001", currency: "BTC", date: "2026-10-10" });
  const btc = () => fetches.filter((f) => !f.includes("frankfurter")).length;
  const before = btc();
  await call("GET", "/api/expenses");
  expect(btc()).toBe(before);
});
