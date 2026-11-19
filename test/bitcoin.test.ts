import { expect, test } from "bun:test";
import { frankfurter, mempool, setup } from "./harness";

const fiat = frankfurter({ "2026-10-02": { EUR: 0.8, GBP: 0.76 } });
const btc = mempool({ "2026-10-01": 120000, "2026-10-02": 100000 });

async function onboarded(baseCurrency: string) {
  const t = setup("2026-10-10T12:00:00Z", (url) => fiat(url) ?? btc(url));
  await t.call("POST", "/api/onboarding", { baseCurrency });
  return t;
}

test("0.001 BTC and 100000 sats store the same value", async () => {
  const { call } = await onboarded("BTC");
  const btc = await call("POST", "/api/transactions", { note: "Coffee", amount: "0.001", currency: "BTC" });
  const sats = await call("POST", "/api/transactions", {
    note: "Coffee",
    amount: "100000",
    currency: "BTC",
    unit: "sats",
  });
  expect(btc.body.amount).toBe(100000);
  expect(sats.body.amount).toBe(100000);
});

test("BTC amounts keep every sat and reject more than 8 decimals or fractional sats", async () => {
  const { call } = await onboarded("BTC");
  const big = await call("POST", "/api/transactions", { note: "House", amount: "20999999.99999999", currency: "BTC" });
  expect(big.body.amount).toBe(2099999999999999);
  for (const [amount, unit] of [["0.000000001"], ["1.5", "sats"], ["0.00000001", "sats"]])
    expect((await call("POST", "/api/transactions", { note: "x", amount, currency: "BTC", unit })).status).toBe(400);
});

test("a BTC expense shows its GBP value from mempool.space, fetched once", async () => {
  const { call, fetches } = await onboarded("GBP");
  await call("POST", "/api/transactions", {
    note: "Coffee",
    amount: "100000",
    currency: "BTC",
    unit: "sats",
    date: "2026-10-02",
  });
  expect((await call("GET", "/api/transactions")).body[0]).toMatchObject({
    amount: 100000,
    currency: "BTC",
    baseAmount: 7600,
  });
  const before = fetches.length;
  await call("GET", "/api/transactions");
  expect(fetches.length).toBe(before);
});

test("with BTC as base, fiat expenses show in sats at each date's rate", async () => {
  const { call } = await onboarded("BTC");
  await call("POST", "/api/transactions", { note: "Lunch", amount: "76.00", currency: "GBP", date: "2026-10-02" });
  await call("POST", "/api/transactions", { note: "Book", amount: "12.00", currency: "USD", date: "2026-10-01" });
  const list = (await call("GET", "/api/transactions")).body;
  expect(list.map((e: { baseAmount: number }) => e.baseAmount)).toEqual([100000, 10000]);
});

async function spending(baseCurrency: string) {
  const t = setup(
    "2026-10-10T12:00:00Z",
    (url) => fiat(url) ?? mempool({ "2026-10-01": 120000, "2026-10-02": 100000, "2026-10-10": 125000 })(url),
  );
  await t.call("POST", "/api/onboarding", { baseCurrency });
  const all: { id: number; name: string }[] = (await t.call("GET", "/api/categories")).body;
  const add = (amount: string, date: string, category: string) =>
    t.call("POST", "/api/transactions", {
      note: category,
      amount,
      currency: "GBP",
      date,
      categoryId: all.find((c) => c.name === category)!.id,
    });
  const sats = async () => (await t.call("GET", "/api/stats?from=2026-09-01&to=2026-10-31&group=month")).body.sats;
  return { ...t, add, sats };
}

test("stats show spending and income in sats at the time and valued today once opted in", async () => {
  const { call, add, sats } = await spending("GBP");
  await add("76.00", "2026-10-02", "Groceries");
  await add("152.00", "2026-10-02", "Salary");
  expect(await sats()).toBeNull();
  expect((await call("PUT", "/api/settings", { sats: true })).body.sats).toBe(true);
  expect(await sats()).toEqual({
    total: 100000,
    income: 200000,
    unconverted: 0,
    today: { total: 9500, income: 19000 },
  });
});

test("sats totals leave out entries without a BTC rate and count them", async () => {
  const { call, add, sats } = await spending("GBP");
  await add("76.00", "2026-10-02", "Groceries");
  await add("5.00", "2026-09-01", "Groceries");
  await call("PUT", "/api/settings", { sats: true });
  expect(await sats()).toMatchObject({ total: 100000, unconverted: 1 });
});

test("sats totals stay off with BTC as base, keeping the stored choice", async () => {
  const { call, sats } = await spending("GBP");
  await call("PUT", "/api/settings", { sats: true });
  await call("PUT", "/api/settings", { baseCurrency: "BTC" });
  expect(await sats()).toBeNull();
  expect((await call("GET", "/api/settings")).body.sats).toBe(true);
});

test("sats totals follow a tag scope", async () => {
  const { call, add } = await spending("GBP");
  await add("76.00", "2026-10-02", "Groceries");
  await call("POST", "/api/transactions", {
    note: "x",
    amount: "38.00",
    currency: "GBP",
    date: "2026-10-02",
    tags: ["trip"],
  });
  await call("PUT", "/api/settings", { sats: true });
  const { body } = await call("GET", "/api/stats?from=2026-09-01&to=2026-10-31&group=month&tag=trip");
  expect(body.sats).toMatchObject({ total: 50000, unconverted: 0 });
});
