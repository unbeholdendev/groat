import { expect, test } from "bun:test";
import { setup } from "./harness";

test("a fresh database needs onboarding", async () => {
  const { call } = setup();
  const settings = await call("GET", "/api/settings");
  expect(settings.body.onboarded).toBe(false);
});

test("onboarding rejects unknown currencies", async () => {
  const { call } = setup();
  for (const body of [{}, { baseCurrency: "XYZ", currencies: [] }, { baseCurrency: "GBP", currencies: ["GBP", "nope"] }])
    expect((await call("POST", "/api/onboarding", body)).status).toBe(400);
  expect((await call("GET", "/api/settings")).body.onboarded).toBe(false);
});

test("settings changes persist and base currency joins the shortlist", async () => {
  const { call } = setup();
  await call("POST", "/api/onboarding", { baseCurrency: "GBP", currencies: ["GBP"] });
  const saved = await call("PUT", "/api/settings", { baseCurrency: "BTC", currencies: ["USD", "JPY"], theme: "dark" });
  expect(saved.status).toBe(200);
  expect((await call("GET", "/api/settings")).body).toEqual({
    onboarded: true,
    baseCurrency: "BTC",
    currencies: ["BTC", "USD", "JPY"],
    lastCurrency: "BTC",
    theme: "dark",
    ai: false,
    voice: false,
  });
  await call("PUT", "/api/settings", { theme: "light" });
  expect((await call("GET", "/api/settings")).body).toMatchObject({ baseCurrency: "BTC", theme: "light" });
  for (const body of [{ theme: "blue" }, { baseCurrency: "XYZ" }, { currencies: "USD" }])
    expect((await call("PUT", "/api/settings", body)).status).toBe(400);
  expect((await call("GET", "/api/settings")).body.theme).toBe("light");
});

test("expense currency must be on the shortlist and defaults to the last one used", async () => {
  const { call } = setup();
  await call("POST", "/api/onboarding", { baseCurrency: "GBP", currencies: ["GBP", "JPY", "BTC"] });
  expect((await call("GET", "/api/settings")).body.lastCurrency).toBe("GBP");
  expect((await call("POST", "/api/expenses", { note: "a", amount: "5", currency: "USD" })).status).toBe(400);
  expect((await call("POST", "/api/expenses", { note: "a", amount: "1.5", currency: "JPY" })).status).toBe(400);
  const ramen = await call("POST", "/api/expenses", { note: "Ramen", amount: "1200", currency: "JPY" });
  expect(ramen.body).toMatchObject({ amount: 1200, currency: "JPY" });
  expect((await call("GET", "/api/settings")).body.lastCurrency).toBe("JPY");
  const next = await call("POST", "/api/expenses", { note: "Tea", amount: "300", date: "2020-01-01" });
  expect(next.body.currency).toBe("JPY");
  await call("POST", "/api/expenses", { note: "Pizza", amount: "0.0001", currency: "BTC", date: "2020-01-01" });
  expect((await call("GET", "/api/settings")).body.lastCurrency).toBe("BTC");
});

test("last-used currency ignores binned and recurring expenses", async () => {
  const { call } = setup();
  await call("POST", "/api/onboarding", { baseCurrency: "GBP", currencies: ["GBP", "JPY", "EUR"] });
  await call("POST", "/api/expenses", { note: "a", amount: "1", currency: "EUR" });
  const binned = await call("POST", "/api/expenses", { note: "b", amount: "1", currency: "JPY" });
  await call("DELETE", `/api/expenses/${binned.body.id}`);
  await call("POST", "/api/recurring", { note: "r", amount: "1", currency: "JPY", period: "day", every: 1, startDate: "2026-10-01" });
  expect((await call("GET", "/api/settings")).body.lastCurrency).toBe("EUR");
});

test("editing keeps the expense's currency unless a shortlisted one is given", async () => {
  const { call } = setup();
  await call("POST", "/api/onboarding", { baseCurrency: "GBP", currencies: ["GBP", "JPY"] });
  const { body } = await call("POST", "/api/expenses", { note: "Ramen", amount: "1200", currency: "JPY" });
  await call("PUT", "/api/settings", { currencies: ["GBP"] });
  expect((await call("PUT", `/api/expenses/${body.id}`, { note: "Ramen", amount: "1300" })).body).toMatchObject({
    amount: 1300,
    currency: "JPY",
  });
  expect((await call("PUT", `/api/expenses/${body.id}`, { note: "Ramen", amount: "8", currency: "USD" })).status).toBe(400);
  expect((await call("PUT", `/api/expenses/${body.id}`, { note: "Ramen", amount: "8", currency: "GBP" })).body).toMatchObject({
    amount: 800,
    currency: "GBP",
  });
});

test("onboarding saves base currency and shortlist and seeds categories once", async () => {
  const { call } = setup();
  const done = await call("POST", "/api/onboarding", { baseCurrency: "EUR", currencies: ["EUR", "BTC", "USD"] });
  expect(done.status).toBe(200);
  expect((await call("GET", "/api/settings")).body).toMatchObject({
    onboarded: true,
    baseCurrency: "EUR",
    currencies: ["EUR", "BTC", "USD"],
  });
  await call("POST", "/api/onboarding", { baseCurrency: "EUR", currencies: ["EUR"] });
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
