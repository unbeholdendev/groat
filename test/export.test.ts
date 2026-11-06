import { expect, test } from "bun:test";
import { frankfurter, setup } from "./harness";

async function exported(request: ReturnType<typeof setup>["request"], query = "") {
  const res = await request(`/api/export?${query}`);
  expect(res.headers.get("content-type")).toStartWith("text/csv");
  return res.text();
}

test("export lists live expenses as CSV with base values, categories and escaping", async () => {
  const { request, call } = setup("2026-10-10T12:00:00Z", frankfurter({ "2026-10-02": { EUR: 0.8, GBP: 0.76 } }));
  await call("POST", "/api/onboarding", { baseCurrency: "GBP" });
  const food = (await call("POST", "/api/categories", { name: "Food", icon: "🍽️", color: "#f00" })).body.id;
  const groceries = (await call("POST", "/api/categories", { name: "Groceries", icon: "🛒", color: "#f00", parentId: food })).body.id;
  await call("POST", "/api/transactions", {
    note: 'Milk, "organic"',
    amount: "10",
    currency: "EUR",
    date: "2026-10-02",
    categoryId: groceries,
    tags: ["b", "a"],
  });
  await call("POST", "/api/transactions", { note: "Dinner", amount: "12.50", currency: "GBP", date: "2026-10-03", categoryId: food });
  const binned = await call("POST", "/api/transactions", { note: "Gone", amount: "1", currency: "GBP" });
  await call("DELETE", `/api/transactions/${binned.body.id}`);
  expect(await exported(request)).toBe(
    [
      "date,type,note,amount,currency,base amount,base currency,category,subcategory,tags",
      "2026-10-03,expense,Dinner,12.50,GBP,12.50,GBP,Food,,",
      '2026-10-02,expense,"Milk, ""organic""",10.00,EUR,9.50,GBP,Food,Groceries,"a, b"',
      "",
    ].join("\r\n"),
  );
});

test("export respects the list filters and leaves base amount blank without a rate", async () => {
  const { request, call } = setup();
  await call("POST", "/api/onboarding", { baseCurrency: "GBP" });
  await call("POST", "/api/transactions", { note: "Ramen", amount: "1200", currency: "JPY", date: "2026-10-01", tags: ["hols"] });
  await call("POST", "/api/transactions", { note: "Bus", amount: "2", currency: "GBP", date: "2026-10-01", tags: ["hols"] });
  await call("POST", "/api/transactions", { note: "Sushi", amount: "900", currency: "JPY", date: "2026-10-05", tags: ["hols"] });
  expect((await exported(request, "tag=hols&currency=JPY&to=2026-10-02")).split("\r\n").slice(1)).toEqual([
    "2026-10-01,expense,Ramen,1200,JPY,,GBP,Uncategorised,,hols",
    "",
  ]);
});

test("export shows bitcoin amounts in BTC to 8 decimals", async () => {
  const { request, call } = setup();
  await call("POST", "/api/onboarding", { baseCurrency: "BTC" });
  await call("POST", "/api/transactions", { note: "Pizza", amount: "0.0012345", currency: "BTC", date: "2026-10-01" });
  expect((await exported(request)).split("\r\n")[1]).toBe("2026-10-01,expense,Pizza,0.00123450,BTC,0.00123450,BTC,Uncategorised,,");
});
