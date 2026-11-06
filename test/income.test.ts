import { expect, test } from "bun:test";
import { frankfurter, setup } from "./harness";

type Category = { id: number; name: string; parentId: number | null; builtin: boolean; kind: string };

async function onboarded() {
  const s = setup("2026-10-10T12:00:00Z", frankfurter({ "2026-09-01": { EUR: 0.8, GBP: 0.75 } }));
  await s.call("POST", "/api/onboarding", { baseCurrency: "GBP" });
  const categories = async (): Promise<Category[]> => (await s.call("GET", "/api/categories")).body;
  const find = async (name: string) => (await categories()).find((c) => c.name === name)!;
  const add = async (note: string, amount: string, category: string, date = "2026-09-05") =>
    (await s.call("POST", "/api/transactions", { note, amount, currency: "GBP", date, categoryId: (await find(category)).id })).body;
  return { ...s, categories, find, add };
}

test("Salary and a built-in Other income are seeded as income; expense categories stay expense", async () => {
  const { find } = await onboarded();
  expect(await find("Salary")).toMatchObject({ kind: "income", builtin: false, parentId: null });
  expect(await find("Other income")).toMatchObject({ kind: "income", builtin: true });
  expect(await find("Uncategorised")).toMatchObject({ kind: "expense", builtin: true });
  expect(await find("Groceries")).toMatchObject({ kind: "expense" });
});

test("a subcategory takes its parent's kind and can't sit under a parent of the other kind", async () => {
  const { call, find } = await onboarded();
  const salary = await find("Salary");
  const bonus = await call("POST", "/api/categories", { name: "Bonus", icon: "🎉", color: "#3fbe90", parentId: salary.id });
  expect(bonus.body).toMatchObject({ kind: "income", parentId: salary.id });
  const side = await call("POST", "/api/categories", { name: "Side gig", icon: "🛠️", color: "#3fbe90", kind: "income" });
  expect(side.body).toMatchObject({ kind: "income", parentId: null });
  const wrong = await call("POST", "/api/categories", { name: "Tips", icon: "x", color: "#fff", kind: "expense", parentId: salary.id });
  expect(wrong.status).toBe(400);
  expect((await call("POST", "/api/categories", { name: "x", icon: "x", color: "#fff", kind: "refund" })).status).toBe(400);
});

test("changing a top-level category's kind moves its subcategories and entries with it", async () => {
  const { call, find, add } = await onboarded();
  const food = await find("Food");
  await add("Shop", "10", "Groceries");
  expect((await call("PUT", `/api/categories/${food.id}`, { kind: "income" })).body).toMatchObject({ kind: "income" });
  expect(await find("Groceries")).toMatchObject({ kind: "income" });
  expect((await call("GET", "/api/transactions?kind=income")).body).toMatchObject([{ note: "Shop" }]);

  expect((await call("PUT", `/api/categories/${(await find("Groceries")).id}`, { kind: "expense" })).status).toBe(400);
  expect((await call("PUT", `/api/categories/${(await find("Uncategorised")).id}`, { kind: "income" })).status).toBe(400);
  expect((await call("PUT", `/api/categories/${(await find("Other income")).id}`, { kind: "expense" })).status).toBe(400);
  expect((await call("PUT", `/api/categories/${(await find("Uncategorised")).id}`, { name: "Misc" })).status).toBe(200);
});

test("deleting a category only moves entries to a category of the same kind", async () => {
  const { call, find, add } = await onboarded();
  const pay = await add("Pay", "3000", "Salary");
  const salary = await find("Salary");
  expect((await call("DELETE", `/api/categories/${salary.id}?moveTo=${(await find("Food")).id}`)).status).toBe(400);
  expect((await call("DELETE", `/api/categories/${(await find("Travel")).id}?moveTo=${(await find("Other income")).id}`)).status).toBe(400);
  expect((await call("DELETE", `/api/categories/${(await find("Other income")).id}`)).status).toBe(400);
  expect((await call("DELETE", `/api/categories/${salary.id}`)).status).toBe(200);
  expect((await call("GET", "/api/transactions")).body).toMatchObject([{ id: pay.id, categoryId: (await find("Other income")).id }]);
});

test("income never counts as spending; stats report income separately", async () => {
  const { call, find, add } = await onboarded();
  await add("Shop", "10", "Groceries");
  await add("Pay", "3000", "Salary");
  await add("Gift", "50", "Other income");
  await add("Old pay", "2000", "Salary", "2026-08-05");
  const { body } = await call("GET", "/api/stats?from=2026-09-01&to=2026-09-30&group=month");
  expect(body.total).toBe(1000);
  expect(body.categories.map((c: { name: string }) => c.name)).toEqual(["Food"]);
  expect(body.buckets).toEqual([{ start: "2026-09-01", total: 1000 }]);
  expect(body.income.total).toBe(305000);
  expect(body.income.categories.map((c: { id: number; total: number }) => [c.id, c.total])).toEqual([
    [(await find("Salary")).id, 300000],
    [(await find("Other income")).id, 5000],
  ]);
  expect(body.previous.income.total).toBe(200000);
  expect(body.previous.total).toBe(0);
});

test("the list filters by kind, and settings say whether any income exists", async () => {
  const { call, add } = await onboarded();
  expect((await call("GET", "/api/settings")).body.income).toBe(false);
  await add("Shop", "10", "Groceries");
  const pay = await add("Pay", "3000", "Salary");
  expect((await call("GET", "/api/transactions?kind=income")).body.map((t: { note: string }) => t.note)).toEqual(["Pay"]);
  expect((await call("GET", "/api/transactions?kind=expense")).body.map((t: { note: string }) => t.note)).toEqual(["Shop"]);
  expect((await call("GET", "/api/transactions?kind=refund")).status).toBe(400);
  expect((await call("GET", "/api/settings")).body.income).toBe(true);
  await call("DELETE", `/api/transactions/${pay.id}`);
  expect((await call("GET", "/api/settings")).body.income).toBe(false);
});

test("CSV export has a type column", async () => {
  const { request, add } = await onboarded();
  await add("Shop", "10", "Groceries");
  await add("Pay", "3000", "Salary", "2026-09-06");
  const csv = await (await request("/api/export")).text();
  expect(csv.split("\r\n").slice(0, 3)).toEqual([
    "date,type,note,amount,currency,base amount,base currency,category,subcategory,tags",
    "2026-09-06,income,Pay,3000.00,GBP,3000.00,GBP,Salary,,",
    "2026-09-05,expense,Shop,10.00,GBP,10.00,GBP,Food,Groceries,",
  ]);
});
