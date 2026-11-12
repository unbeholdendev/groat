import { expect, test } from "bun:test";
import { setup } from "./harness";

const notes = async (call: ReturnType<typeof setup>["call"], query: string) =>
  (await call("GET", `/api/transactions?${query}`)).body.map((e: { note: string }) => e.note);

test("date range keeps expenses between from and to inclusive", async () => {
  const { call } = setup();
  for (const date of ["2026-09-30", "2026-10-01", "2026-10-05", "2026-10-06"])
    await call("POST", "/api/transactions", { note: date, amount: "1", date });
  expect(await notes(call, "from=2026-10-01&to=2026-10-05")).toEqual(["2026-10-05", "2026-10-01"]);
  expect(await notes(call, "from=2026-10-05")).toEqual(["2026-10-06", "2026-10-05"]);
});

test("category filter includes its subcategories", async () => {
  const { call } = setup();
  const food = (await call("POST", "/api/categories", { name: "Food", icon: "🍽️", color: "#f00" })).body.id;
  const groceries = (
    await call("POST", "/api/categories", { name: "Groceries", icon: "🛒", color: "#f00", parentId: food })
  ).body.id;
  await call("POST", "/api/transactions", { note: "dinner", amount: "1", categoryId: food });
  await call("POST", "/api/transactions", { note: "milk", amount: "1", categoryId: groceries });
  await call("POST", "/api/transactions", { note: "bus", amount: "1" });
  expect(await notes(call, `category=${food}`)).toEqual(["milk", "dinner"]);
  expect(await notes(call, `category=${groceries}`)).toEqual(["milk"]);
  expect((await call("GET", "/api/transactions?category=abc")).status).toBe(400);
});

test("tag, currency and note search narrow the list and combine", async () => {
  const { call } = setup();
  await call("POST", "/api/transactions", { note: "Coffee in Paris", amount: "3", currency: "EUR", tags: ["hols"] });
  await call("POST", "/api/transactions", { note: "coffee at home", amount: "3", currency: "GBP", tags: ["hols"] });
  await call("POST", "/api/transactions", { note: "Museum", amount: "9", currency: "EUR" });
  expect(await notes(call, "tag=hols")).toEqual(["coffee at home", "Coffee in Paris"]);
  expect(await notes(call, "currency=EUR")).toEqual(["Museum", "Coffee in Paris"]);
  expect(await notes(call, "q=COFFEE")).toEqual(["coffee at home", "Coffee in Paris"]);
  expect(await notes(call, "q=paris")).toEqual(["Coffee in Paris"]);
  expect(await notes(call, "tag=hols&currency=EUR")).toEqual(["Coffee in Paris"]);
  expect(await notes(call, "q=coffee&currency=EUR&tag=nope")).toEqual([]);
});

test("autocomplete suggests distinct notes with the latest live match's details", async () => {
  const { call } = setup();
  const food = (await call("POST", "/api/categories", { name: "Food", icon: "🍽️", color: "#f00" })).body.id;
  await call("POST", "/api/transactions", { note: "Coffee", amount: "2.50", currency: "GBP", date: "2026-10-01" });
  await call("POST", "/api/transactions", {
    note: "Coffee",
    amount: "3",
    currency: "EUR",
    date: "2026-10-03",
    categoryId: food,
  });
  await call("POST", "/api/transactions", { note: "Coffee", amount: "1", currency: "GBP", date: "2026-10-02" });
  await call("POST", "/api/transactions", { note: "cookies", amount: "4", currency: "GBP", date: "2026-10-04" });
  await call("POST", "/api/transactions", { note: "Tea", amount: "1", currency: "GBP" });
  const binned = await call("POST", "/api/transactions", {
    note: "Coffee",
    amount: "99",
    currency: "GBP",
    date: "2026-10-09",
  });
  await call("DELETE", `/api/transactions/${binned.body.id}`);
  const gone = await call("POST", "/api/transactions", { note: "Cocoa", amount: "5", currency: "GBP" });
  await call("DELETE", `/api/transactions/${gone.body.id}`);
  const uncategorised = (await call("GET", "/api/categories")).body.find((c: { builtin: boolean }) => c.builtin).id;
  expect((await call("GET", "/api/notes?prefix=co")).body).toEqual([
    { note: "cookies", categoryId: uncategorised, currency: "GBP", amount: 400 },
    { note: "Coffee", categoryId: food, currency: "EUR", amount: 300 },
  ]);
  expect((await call("GET", "/api/notes?prefix=%25")).body).toEqual([]);
});
