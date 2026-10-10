import { expect, test } from "bun:test";
import { frankfurter, setup } from "./harness";

const rates = { "2026-09-01": { EUR: 0.8, GBP: 0.75, JPY: 150 } };

async function onboarded() {
  const s = setup("2026-10-10T12:00:00Z", frankfurter(rates));
  await s.call("POST", "/api/onboarding", { baseCurrency: "GBP", currencies: ["GBP", "EUR", "JPY"] });
  const all: { id: number; name: string }[] = (await s.call("GET", "/api/categories")).body;
  const id = (name: string) => all.find((c) => c.name === name)!.id;
  const spend = (note: string, amount: string, currency: string, date: string, category: string) =>
    s.call("POST", "/api/expenses", { note, amount, currency, date, categoryId: id(category) });
  return { ...s, id, spend };
}

test("category totals add mixed currencies in base currency, largest first", async () => {
  const { call, id, spend } = await onboarded();
  await spend("Shop", "10.00", "GBP", "2026-09-03", "Groceries");
  await spend("Cafe", "8.00", "EUR", "2026-09-05", "Eating out");
  await spend("Train", "3000", "JPY", "2026-09-07", "Public transport");
  const { body } = await call("GET", "/api/stats?from=2026-09-01&to=2026-09-30&group=month");
  expect(body.total).toBe(3250);
  expect(body.categories.map((c: { id: number; total: number }) => [c.id, c.total])).toEqual([
    [id("Food"), 1750],
    [id("Transport"), 1500],
  ]);
});

test("drill-down splits a category into subcategories that sum to it, including spend on the parent itself", async () => {
  const { call, id, spend } = await onboarded();
  await spend("Shop", "10.00", "GBP", "2026-09-03", "Groceries");
  await spend("Lunch", "4.00", "GBP", "2026-09-04", "Eating out");
  await spend("Snack", "1.00", "GBP", "2026-09-04", "Food");
  const [food] = (await call("GET", "/api/stats?from=2026-09-01&to=2026-09-30")).body.categories;
  expect(food.total).toBe(1500);
  expect(food.children.map((c: { id: number; total: number }) => [c.id, c.total])).toEqual([
    [id("Groceries"), 1000],
    [id("Eating out"), 400],
    [id("Food"), 100],
  ]);
});

test("buckets by day, week (Monday start) and month include empty ones", async () => {
  const { call, spend } = await onboarded();
  await spend("a", "1.00", "GBP", "2026-09-01", "Food");
  await spend("b", "2.00", "GBP", "2026-09-03", "Food");
  await spend("c", "4.00", "GBP", "2026-10-09", "Food");
  const buckets = async (q: string) => (await call("GET", `/api/stats?${q}`)).body.buckets;
  expect(await buckets("from=2026-09-01&to=2026-09-04&group=day")).toEqual([
    { start: "2026-09-01", total: 100 },
    { start: "2026-09-02", total: 0 },
    { start: "2026-09-03", total: 200 },
    { start: "2026-09-04", total: 0 },
  ]);
  expect(await buckets("from=2026-09-02&to=2026-09-15&group=week")).toEqual([
    { start: "2026-08-31", total: 200 },
    { start: "2026-09-07", total: 0 },
    { start: "2026-09-14", total: 0 },
  ]);
  expect(await buckets("from=2026-08-15&to=2026-10-31&group=month")).toEqual([
    { start: "2026-08-01", total: 0 },
    { start: "2026-09-01", total: 300 },
    { start: "2026-10-01", total: 400 },
  ]);
});

test("previous period is the equal-length window just before the range", async () => {
  const { call, id, spend } = await onboarded();
  await spend("in range", "5.00", "GBP", "2026-09-01", "Food");
  await spend("first day of previous", "2.00", "GBP", "2026-08-02", "Food");
  await spend("last day of previous", "3.00", "GBP", "2026-08-31", "Health");
  await spend("too early", "100.00", "GBP", "2026-08-01", "Food");
  const { previous } = (await call("GET", "/api/stats?from=2026-09-01&to=2026-09-30&group=month")).body;
  expect(previous).toMatchObject({ from: "2026-08-02", to: "2026-08-31", total: 500 });
  expect(previous.categories.map((c: { id: number; total: number }) => [c.id, c.total])).toEqual([
    [id("Health"), 300],
    [id("Food"), 200],
  ]);
});

test("binned expenses are left out", async () => {
  const { call, spend } = await onboarded();
  await spend("kept", "1.00", "GBP", "2026-09-03", "Food");
  const binned = await spend("binned", "9.00", "GBP", "2026-09-03", "Food");
  await call("DELETE", `/api/expenses/${binned.body.id}`);
  expect((await call("GET", "/api/stats?from=2026-09-01&to=2026-09-30")).body.total).toBe(100);
});

test("expenses without a rate are counted as unconverted, not summed", async () => {
  const { call, spend } = await onboarded();
  await spend("old", "5.00", "EUR", "2020-01-01", "Food");
  const { body } = await call("GET", "/api/stats?from=2020-01-01&to=2020-01-01");
  expect(body).toMatchObject({ total: 0, unconverted: 1, categories: [] });
});

test("rejects a bad range or grouping", async () => {
  const { call } = await onboarded();
  for (const q of ["", "from=2026-09-30&to=2026-09-01", "from=2026-09-01&to=2026-09-30&group=year"])
    expect((await call("GET", `/api/stats?${q}`)).status).toBe(400);
});
