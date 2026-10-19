import { expect, test } from "bun:test";
import { setup } from "./harness";

test("a fresh database needs onboarding", async () => {
  const { call } = setup();
  const settings = await call("GET", "/api/settings");
  expect(settings.body.onboarded).toBe(false);
});

test("onboarding rejects unknown currencies", async () => {
  const { call } = setup();
  for (const body of [{}, { baseCurrency: "XYZ" }])
    expect((await call("POST", "/api/onboarding", body)).status).toBe(400);
  expect((await call("GET", "/api/settings")).body.onboarded).toBe(false);
});

test("settings changes persist", async () => {
  const { call } = setup();
  await call("POST", "/api/onboarding", { baseCurrency: "GBP" });
  const saved = await call("PUT", "/api/settings", { baseCurrency: "BTC", theme: "dark" });
  expect(saved.status).toBe(200);
  expect((await call("GET", "/api/settings")).body).toEqual({
    onboarded: true,
    baseCurrency: "BTC",
    recentCurrencies: ["BTC"],
    lastCurrency: "BTC",
    theme: "dark",
    ai: false,
    vision: false,
    voice: false,
  });
  await call("PUT", "/api/settings", { theme: "light" });
  expect((await call("GET", "/api/settings")).body).toMatchObject({ baseCurrency: "BTC", theme: "light" });
  for (const body of [{ theme: "blue" }, { baseCurrency: "XYZ" }])
    expect((await call("PUT", "/api/settings", body)).status).toBe(400);
  expect((await call("GET", "/api/settings")).body.theme).toBe("light");
});

test("expense currency must be a known one and defaults to the last one used", async () => {
  const { call } = setup();
  await call("POST", "/api/onboarding", { baseCurrency: "GBP" });
  expect((await call("GET", "/api/settings")).body).toMatchObject({ lastCurrency: "GBP", recentCurrencies: ["GBP"] });
  expect((await call("POST", "/api/expenses", { note: "a", amount: "5", currency: "XYZ" })).status).toBe(400);
  expect((await call("POST", "/api/expenses", { note: "a", amount: "1.5", currency: "JPY" })).status).toBe(400);
  const ramen = await call("POST", "/api/expenses", { note: "Ramen", amount: "1200", currency: "JPY" });
  expect(ramen.body).toMatchObject({ amount: 1200, currency: "JPY" });
  expect((await call("GET", "/api/settings")).body.lastCurrency).toBe("JPY");
  const next = await call("POST", "/api/expenses", { note: "Tea", amount: "300", date: "2020-01-01" });
  expect(next.body.currency).toBe("JPY");
  await call("POST", "/api/expenses", { note: "Pizza", amount: "0.0001", currency: "BTC", date: "2020-01-01" });
  await call("POST", "/api/expenses", { note: "Bus", amount: "2", currency: "GBP", date: "2020-01-01" });
  expect((await call("GET", "/api/settings")).body).toMatchObject({ lastCurrency: "GBP", recentCurrencies: ["GBP", "BTC", "JPY"] });
});

test("last-used currency ignores binned and recurring expenses", async () => {
  const { call } = setup();
  await call("POST", "/api/onboarding", { baseCurrency: "GBP" });
  await call("POST", "/api/expenses", { note: "a", amount: "1", currency: "EUR" });
  const binned = await call("POST", "/api/expenses", { note: "b", amount: "1", currency: "JPY" });
  await call("DELETE", `/api/expenses/${binned.body.id}`);
  await call("POST", "/api/recurring", { note: "r", amount: "1", currency: "JPY", period: "day", every: 1, startDate: "2026-10-01" });
  expect((await call("GET", "/api/settings")).body.lastCurrency).toBe("EUR");
});

test("editing keeps the expense's currency unless a known one is given", async () => {
  const { call } = setup();
  await call("POST", "/api/onboarding", { baseCurrency: "GBP" });
  const { body } = await call("POST", "/api/expenses", { note: "Ramen", amount: "1200", currency: "JPY" });
  expect((await call("PUT", `/api/expenses/${body.id}`, { note: "Ramen", amount: "1300" })).body).toMatchObject({
    amount: 1300,
    currency: "JPY",
  });
  expect((await call("PUT", `/api/expenses/${body.id}`, { note: "Ramen", amount: "8", currency: "XYZ" })).status).toBe(400);
  expect((await call("PUT", `/api/expenses/${body.id}`, { note: "Ramen", amount: "8", currency: "GBP" })).body).toMatchObject({
    amount: 800,
    currency: "GBP",
  });
});

test("an expense in a currency no longer offered still reads and edits", async () => {
  const { call, db } = setup();
  await call("POST", "/api/onboarding", { baseCurrency: "GBP" });
  const { body } = await call("POST", "/api/expenses", { note: "Old", amount: "5" });
  db.run("UPDATE expenses SET currency = 'ADP' WHERE id = ?", [body.id]);
  expect((await call("GET", "/api/expenses")).body[0]).toMatchObject({ currency: "ADP", baseAmount: null });
  expect((await call("PUT", `/api/expenses/${body.id}`, { note: "Old", amount: "6" })).body).toMatchObject({ currency: "ADP", amount: 600 });
  expect((await call("POST", "/api/expenses", { note: "New", amount: "1", currency: "ZWL" })).status).toBe(400);
});

test("onboarding saves base currency and seeds categories once", async () => {
  const { call } = setup();
  const done = await call("POST", "/api/onboarding", { baseCurrency: "EUR" });
  expect(done.status).toBe(200);
  expect((await call("GET", "/api/settings")).body).toMatchObject({ onboarded: true, baseCurrency: "EUR" });
  await call("POST", "/api/onboarding", { baseCurrency: "EUR" });
  const categories = (await call("GET", "/api/categories")).body;
  const tree = categories
    .filter((c: { parentId: number | null }) => c.parentId === null)
    .map((p: { id: number; name: string }) => [
      p.name,
      categories.filter((c: { parentId: number }) => c.parentId === p.id).map((c: { name: string }) => c.name),
    ]);
  expect(tree).toEqual([
    ["Food", ["Groceries", "Eating out"]],
    ["Transport", ["Fuel", "Public transport", "Taxi"]],
    ["Home", ["Rent/Mortgage", "Utilities", "Maintenance"]],
    ["Subscriptions", []],
    ["Health", []],
    ["Shopping", []],
    ["Entertainment", []],
    ["Travel", []],
    ["Gifts", []],
    ["Uncategorised", []],
  ]);
});
