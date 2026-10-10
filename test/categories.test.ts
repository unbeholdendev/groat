import { expect, test } from "bun:test";
import { setup } from "./harness";

type Category = { id: number; name: string; parentId: number | null; builtin: boolean };

async function onboarded() {
  const s = setup();
  await s.call("POST", "/api/onboarding", { baseCurrency: "GBP", currencies: ["GBP"] });
  const categories = async (): Promise<Category[]> => (await s.call("GET", "/api/categories")).body;
  const all = await categories();
  const find = (name: string) => all.find((c) => c.name === name)!;
  return { ...s, find, categories };
}

test("expenses default to Uncategorised and keep their category and tags", async () => {
  const { call, find } = await onboarded();
  const plain = await call("POST", "/api/expenses", { note: "Thing", amount: "1" });
  expect(plain.body).toMatchObject({ categoryId: find("Uncategorised").id, tags: [] });
  const lunch = await call("POST", "/api/expenses", {
    note: "Lunch",
    amount: "12",
    categoryId: find("Eating out").id,
    tags: ["work", " holiday-2026 ", "work"],
  });
  expect(lunch.status).toBe(201);
  expect((await call("GET", "/api/expenses")).body[0]).toMatchObject({
    note: "Lunch",
    categoryId: find("Eating out").id,
    tags: ["holiday-2026", "work"],
  });
  const edited = await call("PUT", `/api/expenses/${lunch.body.id}`, { note: "Lunch", amount: "12", tags: ["work"] });
  expect(edited.body).toMatchObject({ categoryId: find("Eating out").id, tags: ["work"] });
  for (const body of [{ categoryId: 9999 }, { tags: "work" }, { tags: [""] }, { tags: [3] }])
    expect((await call("POST", "/api/expenses", { note: "x", amount: "1", ...body })).status).toBe(400);
});

test("categories can be created, renamed, recoloured and reordered, two levels deep", async () => {
  const { call, find, categories } = await onboarded();
  const pets = await call("POST", "/api/categories", { name: "Pets", icon: "🐶", color: "#000000" });
  expect(pets.status).toBe(201);
  const vet = await call("POST", "/api/categories", { name: "Vet", icon: "🩺", color: "#111111", parentId: pets.body.id });
  expect(vet.body).toMatchObject({ name: "Vet", parentId: pets.body.id });
  const deep = { name: "Deep", icon: "x", color: "#fff", parentId: vet.body.id };
  expect((await call("POST", "/api/categories", deep)).status).toBe(400);
  for (const body of [{ icon: "x", color: "#fff" }, { name: "x", color: "#fff" }, { ...deep, parentId: 9999 }])
    expect((await call("POST", "/api/categories", body)).status).toBe(400);

  const renamed = await call("PUT", `/api/categories/${pets.body.id}`, { name: "Animals", color: "#222222" });
  expect(renamed.body).toMatchObject({ name: "Animals", icon: "🐶", color: "#222222" });
  expect((await call("PUT", `/api/categories/${pets.body.id}`, { name: " " })).status).toBe(400);
  expect((await call("PUT", "/api/categories/9999", { name: "x" })).status).toBe(404);

  const parents = (await categories()).filter((c) => c.parentId === null).map((c) => c.id);
  const order = [find("Uncategorised").id, pets.body.id, ...parents.filter((id) => id !== pets.body.id && id !== find("Uncategorised").id)];
  expect((await call("PUT", "/api/categories/order", order)).status).toBe(200);
  const names = (await categories()).filter((c) => c.parentId === null).map((c) => c.name);
  expect(names.slice(0, 3)).toEqual(["Uncategorised", "Animals", "Food"]);
  expect((await call("PUT", "/api/categories/order", ["x"])).status).toBe(400);
});

test("Uncategorised cannot be deleted", async () => {
  const { call, find, categories } = await onboarded();
  expect((await call("DELETE", `/api/categories/${find("Uncategorised").id}`)).status).toBe(400);
  expect((await categories()).some((c) => c.name === "Uncategorised")).toBe(true);
  expect((await call("DELETE", "/api/categories/9999")).status).toBe(404);
});

test("deleting a category moves its expenses to Uncategorised by default", async () => {
  const { call, find, categories } = await onboarded();
  const e = await call("POST", "/api/expenses", { note: "Film", amount: "9", categoryId: find("Entertainment").id });
  expect((await call("DELETE", `/api/categories/${find("Entertainment").id}`)).status).toBe(200);
  expect((await categories()).some((c) => c.name === "Entertainment")).toBe(false);
  expect((await call("GET", "/api/expenses")).body).toMatchObject([{ id: e.body.id, categoryId: find("Uncategorised").id }]);
});

test("deleting a parent moves expenses under it and its subcategories to the chosen category", async () => {
  const { call, find, categories } = await onboarded();
  const food = find("Food").id;
  for (const categoryId of [food, find("Groceries").id, find("Eating out").id, find("Travel").id])
    await call("POST", "/api/expenses", { note: "x", amount: "1", categoryId });
  const binned = await call("POST", "/api/expenses", { note: "binned", amount: "1", categoryId: find("Groceries").id });
  await call("DELETE", `/api/expenses/${binned.body.id}`);

  expect((await call("DELETE", `/api/categories/${food}?moveTo=${find("Groceries").id}`)).status).toBe(400);
  expect((await call("DELETE", `/api/categories/${food}?moveTo=9999`)).status).toBe(400);
  expect((await call("DELETE", `/api/categories/${food}?moveTo=${find("Shopping").id}`)).status).toBe(200);

  expect((await categories()).filter((c) => ["Food", "Groceries", "Eating out"].includes(c.name))).toEqual([]);
  const ids = (await call("GET", "/api/expenses")).body.map((e: { categoryId: number }) => e.categoryId);
  expect(ids.sort()).toEqual([find("Shopping").id, find("Shopping").id, find("Shopping").id, find("Travel").id].sort());
  expect((await call("GET", "/api/bin")).body[0].categoryId).toBe(find("Shopping").id);
});

test("expenses can be saved before onboarding", async () => {
  const { call } = setup();
  const uncategorised = (await call("GET", "/api/categories")).body;
  expect(uncategorised).toMatchObject([{ name: "Uncategorised", builtin: true }]);
  expect((await call("POST", "/api/expenses", { note: "x", amount: "1" })).body.categoryId).toBe(uncategorised[0].id);
});
