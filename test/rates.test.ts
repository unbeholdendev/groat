import { expect, test } from "bun:test";
import { frankfurter, mempool, setup } from "./harness";

const rates = {
  "2026-10-01": { EUR: 0.9, GBP: 0.72, JPY: 150 },
  "2026-10-02": { EUR: 0.8, GBP: 0.76, JPY: 160 },
};

async function onboarded(currencies: string[], handler = frankfurter(rates)) {
  const t = setup("2026-10-10T12:00:00Z", handler);
  await t.call("POST", "/api/onboarding", { baseCurrency: currencies[0], currencies });
  return t;
}

test("an EUR expense shows its GBP value at the rate for its date", async () => {
  const { call } = await onboarded(["GBP", "EUR"]);
  await call("POST", "/api/expenses", { note: "Lunch", amount: "10.00", currency: "EUR", date: "2026-10-02" });
  const [lunch] = (await call("GET", "/api/expenses")).body;
  expect(lunch).toMatchObject({ amount: 1000, currency: "EUR", baseAmount: 950 });
});

test("rates are fetched once per date and reused", async () => {
  const { call, fetches } = await onboarded(["GBP", "EUR", "JPY"]);
  await call("POST", "/api/expenses", { note: "a", amount: "1", currency: "EUR", date: "2026-10-02" });
  await call("POST", "/api/expenses", { note: "b", amount: "100", currency: "JPY", date: "2026-10-02" });
  await call("POST", "/api/expenses", { note: "c", amount: "1", currency: "EUR", date: "2026-10-01" });
  await call("GET", "/api/expenses");
  await call("GET", "/api/expenses");
  expect(fetches.length).toBe(2);
});

test("weekend dates use the prior business day's rate", async () => {
  const { call, fetches } = await onboarded(["GBP", "EUR"]);
  await call("POST", "/api/expenses", { note: "Brunch", amount: "10", currency: "EUR", date: "2026-10-04" });
  const [brunch] = (await call("GET", "/api/expenses")).body;
  expect(brunch.baseAmount).toBe(950);
  expect(fetches).toEqual(["https://api.frankfurter.dev/v2/rates?date=2026-10-04&base=USD&quotes=EUR,GBP&providers=ECB"]);
});

test("a manual rate fills in when the fetch fails", async () => {
  const { call, fetches } = await onboarded(["GBP", "EUR"], () => new Response("down", { status: 503 }));
  await call("POST", "/api/expenses", { note: "Lunch", amount: "10", currency: "EUR", date: "2026-10-02" });
  expect((await call("GET", "/api/expenses")).body[0].baseAmount).toBeNull();
  for (const rate of ["", "0", "-1", "abc", 0.8])
    expect((await call("PUT", "/api/rates", { date: "2026-10-02", currency: "EUR", rate })).status).toBe(400);
  expect((await call("PUT", "/api/rates", { date: "2026-10-02", currency: "EUR", rate: "0.8" })).status).toBe(200);
  expect((await call("PUT", "/api/rates", { date: "2026-10-02", currency: "GBP", rate: "0.76" })).status).toBe(200);
  const before = fetches.length;
  expect((await call("GET", "/api/expenses")).body[0].baseAmount).toBe(950);
  expect(fetches.length).toBe(before);
});

test("changing base currency re-denominates history without fetching", async () => {
  const { call, fetches } = await onboarded(["GBP", "EUR", "JPY"]);
  await call("POST", "/api/expenses", { note: "a", amount: "10", currency: "EUR", date: "2026-10-02" });
  await call("POST", "/api/expenses", { note: "b", amount: "1000", currency: "JPY", date: "2026-10-01" });
  await call("GET", "/api/expenses");
  const before = fetches.length;
  await call("PUT", "/api/settings", { baseCurrency: "EUR" });
  expect((await call("GET", "/api/expenses")).body.map((e: { baseAmount: number }) => e.baseAmount)).toEqual([1000, 600]);
  await call("PUT", "/api/settings", { baseCurrency: "JPY" });
  expect((await call("GET", "/api/expenses")).body.map((e: { baseAmount: number }) => e.baseAmount)).toEqual([2000, 1000]);
  expect(fetches.length).toBe(before);
});

test("zero-decimal currencies convert in whole units", async () => {
  const { call } = await onboarded(["GBP", "JPY"]);
  const ramen = await call("POST", "/api/expenses", { note: "Ramen", amount: "1600", currency: "JPY", date: "2026-10-02" });
  expect(ramen.body.amount).toBe(1600);
  expect((await call("GET", "/api/expenses")).body[0]).toMatchObject({ amount: 1600, currency: "JPY", baseAmount: 760 });
  await call("PUT", "/api/settings", { baseCurrency: "JPY" });
  await call("POST", "/api/expenses", { note: "Tea", amount: "2.50", currency: "GBP", date: "2026-10-01" });
  expect((await call("GET", "/api/expenses")).body[1]).toMatchObject({ amount: 250, currency: "GBP", baseAmount: 521 });
});

test("today's rates are used but not cached", async () => {
  const fiat = frankfurter(rates);
  const btc = mempool({ "2026-10-01": 50_000 });
  const { call, fetches } = await onboarded(["GBP", "EUR", "BTC"], (url) => fiat(url) ?? btc(url));
  await call("POST", "/api/expenses", { note: "a", amount: "10", currency: "EUR", date: "2026-10-10" });
  await call("POST", "/api/expenses", { note: "b", amount: "0.001", currency: "BTC", date: "2026-10-10" });
  expect((await call("GET", "/api/expenses")).body.map((e: { baseAmount: number }) => e.baseAmount)).toEqual([3800, 950]);
  await call("GET", "/api/expenses");
  expect(fetches.length).toBe(4);
});

test("a failed fetch is not retried until restart", async () => {
  const { call, fetches, restart } = await onboarded(["GBP", "EUR"], () => new Response("down", { status: 503 }));
  await call("POST", "/api/expenses", { note: "Lunch", amount: "10", currency: "EUR", date: "2026-10-02" });
  await call("GET", "/api/expenses");
  await call("GET", "/api/expenses");
  expect(fetches.length).toBe(1);
  restart();
  await call("GET", "/api/expenses");
  expect(fetches.length).toBe(2);
});
