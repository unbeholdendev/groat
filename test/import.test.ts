import { expect, test } from "bun:test";
import { frankfurter, setup } from "./harness";

type Category = { id: number; name: string; parentId: number | null; kind: string };
type Transaction = { note: string; amount: number; currency: string; date: string; categoryId: number; tags: string[]; createdBy: number };

async function onboarded() {
  const h = setup("2026-10-10T12:00:00Z", frankfurter({ "2026-01-01": { EUR: 0.9, GBP: 0.8, JPY: 150 } }));
  await h.call("POST", "/api/onboarding", { baseCurrency: "GBP" });
  const upload = async (path: string, csv: string, cookie = "session=admin") => {
    if (cookie === "session=admin") h.db.run("INSERT OR REPLACE INTO sessions (id, user_id, expires_at) VALUES ('admin', 1, '9999')");
    const form = new FormData();
    form.append("file", new File([csv], "expenses.csv", { type: "text/csv" }));
    const res = await h.app.request(path, { method: "POST", body: form, headers: { cookie } });
    return { status: res.status, body: await res.json() };
  };
  const listed = async () => {
    const cats: Category[] = (await h.call("GET", "/api/categories")).body;
    const name = (id: number) => {
      const c = cats.find((c) => c.id === id)!;
      const parent = cats.find((p) => p.id === c.parentId);
      return parent ? `${parent.name} › ${c.name}` : c.name;
    };
    const rows: Transaction[] = (await h.call("GET", "/api/transactions")).body;
    return rows.map((e) => ({ date: e.date, note: e.note, amount: e.amount, currency: e.currency, category: name(e.categoryId), tags: e.tags }));
  };
  const kinds = async () => {
    const cats: Category[] = (await h.call("GET", "/api/categories")).body;
    const rows: Transaction[] = (await h.call("GET", "/api/transactions")).body;
    return rows.map((e) => cats.find((c) => c.id === e.categoryId)!.kind);
  };
  return { ...h, upload, listed, kinds };
}

const sample = [
  "note,date,amount,currency,category,subcategory,tags",
  '"Pizza, large",2025-03-01,0.00012345,BTC,Food,Eating out,',
  "Ramen,2025-03-02,1200.00,JPY,food,groceries,",
  "Vet,2025-03-03,80.50,GBP,Pets,Vet,\"dog, health\"",
  "Kibble,2025-03-04,20,EUR,pets,,dog",
  "Gum,2025-03-05,1.00,GBP,,,",
].join("\r\n");

test("a preview counts rows, totals each currency and lists the categories it will create", async () => {
  const h = await onboarded();
  expect(await h.upload("/api/import/preview", sample)).toEqual({
    status: 200,
    body: {
      count: 5,
      totals: [
        { currency: "BTC", amount: "0.00012345" },
        { currency: "EUR", amount: "20.00" },
        { currency: "GBP", amount: "81.50" },
        { currency: "JPY", amount: "1200" },
      ],
      categories: ["Pets", "Pets › Vet"],
      rejected: [],
    },
  });
  expect(await h.listed()).toEqual([]);
});

test("confirming imports exact amounts, matches categories by name and creates the rest", async () => {
  const h = await onboarded();
  expect(await h.upload("/api/import", sample)).toEqual({ status: 200, body: { imported: 5 } });
  expect(await h.listed()).toEqual([
    { date: "2025-03-05", note: "Gum", amount: 100, currency: "GBP", category: "Uncategorised", tags: [] },
    { date: "2025-03-04", note: "Kibble", amount: 2000, currency: "EUR", category: "Pets", tags: ["dog"] },
    { date: "2025-03-03", note: "Vet", amount: 8050, currency: "GBP", category: "Pets › Vet", tags: ["dog", "health"] },
    { date: "2025-03-02", note: "Ramen", amount: 1200, currency: "JPY", category: "Food › Groceries", tags: [] },
    { date: "2025-03-01", note: "Pizza, large", amount: 12345, currency: "BTC", category: "Food › Eating out", tags: [] },
  ]);
  expect(h.db.query("SELECT DISTINCT created_by FROM transactions").values()).toEqual([[1]]);
  expect(h.db.query("SELECT count(*) FROM categories WHERE lower(name) = 'pets'").values()).toEqual([[1]]);
});

test("bad rows are listed with their line and reason, and block the import", async () => {
  const h = await onboarded();
  const csv = [
    "date,note,amount,currency",
    "2025-02-30,Bad date,1,GBP",
    "2025-03-01,Unknown,1,XYZ",
    "2025-03-01,Too precise,1.234,GBP",
    "2025-03-01,Comma,\"1,50\",GBP",
    "2025-03-01,Negative,-5,GBP",
    "2025-03-01,,5,GBP",
    ",No date,5,GBP",
    "2025-03-01,No currency,5,",
    "2025-03-01,Fine,5,GBP",
  ].join("\n");
  const preview = await h.upload("/api/import/preview", csv);
  expect(preview.body.rejected).toEqual([
    { line: 2, error: "Invalid date" },
    { line: 3, error: "Invalid currency" },
    { line: 4, error: "Invalid amount" },
    { line: 5, error: "Invalid amount" },
    { line: 6, error: "Invalid amount" },
    { line: 7, error: "Enter a note" },
    { line: 8, error: "Invalid date" },
    { line: 9, error: "Invalid currency" },
  ]);
  expect(preview.body.count).toBe(1);
  expect(await h.upload("/api/import", csv)).toEqual({ status: 400, body: { error: "Fix the rejected rows, then import again" } });
  expect(await h.listed()).toEqual([]);
});

test("a file without the required columns is refused", async () => {
  const h = await onboarded();
  for (const csv of ["", "date,note,amount\n2025-03-01,Tea,1"])
    expect(await h.upload("/api/import/preview", csv)).toEqual({ status: 400, body: { error: "The file needs date, note, amount and currency columns" } });
});

test("import only runs on an instance with no expenses, schedules or tags", async () => {
  for (const add of [
    (h: Awaited<ReturnType<typeof onboarded>>) => h.call("POST", "/api/transactions", { note: "Tea", amount: "1" }),
    (h: Awaited<ReturnType<typeof onboarded>>) => h.call("POST", "/api/recurring", { note: "Rent", amount: "900", period: "month", every: 1, startDate: "2027-01-01" }),
  ]) {
    const h = await onboarded();
    await add(h);
    const before = await h.listed();
    for (const path of ["/api/import/preview", "/api/import"])
      expect(await h.upload(path, sample)).toEqual({ status: 409, body: { error: "Import only works before any expenses are added" } });
    expect(await h.listed()).toEqual(before);
  }
});

test("only admins can import", async () => {
  const h = await onboarded();
  await h.call("POST", "/api/users", { username: "bob", password: "pw" });
  const login = await h.app.request("/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "bob", password: "pw" }) });
  const cookie = login.headers.get("set-cookie")!.split(";")[0];
  expect((await h.upload("/api/import", sample, cookie)).status).toBe(403);
});

test("an export imports back into a fresh instance", async () => {
  const source = await onboarded();
  const food = (await source.call("GET", "/api/categories")).body.find((c: Category) => c.name === "Food").id;
  await source.call("POST", "/api/transactions", { note: 'Milk, "organic"', amount: "10", currency: "EUR", date: "2026-10-02", tags: ["b", "a"] });
  await source.call("POST", "/api/transactions", { note: "Dinner", amount: "12.50", currency: "GBP", date: "2026-10-03", categoryId: food });
  await source.call("POST", "/api/transactions", { note: "Node", amount: "21000", currency: "BTC", unit: "sats", date: "2026-10-04" });
  const freelance = (await source.call("POST", "/api/categories", { name: "Freelance", icon: "🎨", color: "#3fbe90", kind: "income" })).body.id;
  const design = (await source.call("POST", "/api/categories", { name: "Design", icon: "🎨", color: "#3fbe90", parentId: freelance })).body.id;
  await source.call("POST", "/api/transactions", { note: "Logo", amount: "300", currency: "GBP", date: "2026-10-05", categoryId: design });
  await source.call("POST", "/api/transactions", { note: "Gift", amount: "50", currency: "GBP", date: "2026-10-06", categoryId: freelance });
  const csv = await (await source.request("/api/export")).text();

  const target = await onboarded();
  expect((await target.upload("/api/import", csv)).body).toEqual({ imported: 5 });
  expect(await target.listed()).toEqual(await source.listed());
  expect(await target.kinds()).toEqual(await source.kinds());
});

test("an unclosed quote fails the whole file instead of swallowing later rows", async () => {
  const h = await onboarded();
  const csv = ["date,note,amount,currency,category", '2025-03-01,Tea,1,GBP,"Drinks', "2025-03-02,Cake,2,GBP,Food"].join("\n");
  for (const path of ["/api/import/preview", "/api/import"])
    expect(await h.upload(path, csv)).toEqual({ status: 400, body: { error: "Line 2 opens a quote that is never closed" } });
  expect(await h.listed()).toEqual([]);
});

test("two imports at once add the rows only once", async () => {
  const h = await onboarded();
  const results = await Promise.all([h.upload("/api/import", sample), h.upload("/api/import", sample)]);
  expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  expect((await h.listed()).length).toBe(5);
});

test("rejected lines are numbered as in the file when a note spans lines", async () => {
  const h = await onboarded();
  const csv = ["date,note,amount,currency", '2025-03-01,"Two', 'lines",1,GBP', "2025-03-02,Bad,1,XYZ"].join("\r\n");
  expect((await h.upload("/api/import/preview", csv)).body).toMatchObject({ count: 1, rejected: [{ line: 4, error: "Invalid currency" }] });
});

test("the type column picks the kind, and a row that contradicts its category is rejected", async () => {
  const h = await onboarded();
  const csv = [
    "date,type,note,amount,currency,category",
    "2025-03-01,income,Tips,5,GBP,",
    "2025-03-02,income,Invoice,500,GBP,Consulting",
    "2025-03-03,,Retainer,200,GBP,Consulting",
    "2025-03-04,expense,Coffee,3,GBP,Salary",
    "2025-03-05,gift,Mug,4,GBP,",
  ].join("\r\n");
  expect((await h.upload("/api/import/preview", csv)).body).toMatchObject({
    count: 3,
    categories: ["Consulting"],
    rejected: [{ line: 5, error: "Salary isn’t an expense category" }, { line: 6, error: "Invalid type" }],
  });
  await h.upload("/api/import", csv.split("\r\n").slice(0, 4).join("\r\n"));
  expect(await h.kinds()).toEqual(["income", "income", "income"]);
  expect((await h.listed()).map((r) => r.category)).toEqual(["Consulting", "Consulting", "Other income"]);
});
