import { add, expect, seed, test, today } from "./fixtures";

const salary = 2;

test("income added in the full form shows in green and never counts as spending", async ({ app: page }) => {
  await add(page, "coffee 3.20");
  await expect(page.getByRole("group", { name: "Show" })).toBeHidden();
  await page.getByRole("button", { name: "Full form", exact: true }).click();
  await page.getByRole("radio", { name: "Income" }).click();
  await expect(page.getByRole("heading", { name: "New income" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Category" }).getByRole("button", { name: "Groceries" })).toBeHidden();
  await page.getByRole("group", { name: "Category" }).getByRole("button", { name: "Salary" }).click();
  await page.getByLabel("Note", { exact: true }).fill("Pay");
  await page.getByLabel("Amount", { exact: true }).fill("3000");
  await page.getByRole("button", { name: "Add", exact: true }).click();

  const pay = page.getByRole("listitem").filter({ hasText: "Pay" });
  await expect(pay).toContainText("+£3,000.00");
  await expect(pay.getByText("+£3,000.00")).toHaveClass(/text-down/);
  await expect(page.locator("header").getByText("£3.20").first()).toBeVisible();

  const show = page.getByRole("group", { name: "Show" });
  await show.getByRole("button", { name: "Income" }).click();
  await expect(page.getByRole("button", { name: "coffee" })).toBeHidden();
  await expect(pay).toBeVisible();
  await show.getByRole("button", { name: "Expenses" }).click();
  await expect(pay).toBeHidden();
  await show.getByRole("button", { name: "All" }).click();

  await page.getByRole("button", { name: "Pay", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Edit income" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Income" })).toBeChecked();
  await page.getByRole("radio", { name: "Expense" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(pay).toContainText("Uncategorised");
  await expect(pay).not.toContainText("+£3,000.00");
});

test("quick-add takes the kind from the matched category", async ({ app: page }) => {
  await seed(page, [{ note: "Salary", amount: "2500", categoryId: salary, date: "2026-01-05" }]);
  await page.reload();
  await add(page, "salary 2600");
  await expect(page.getByRole("listitem").filter({ hasText: "salary" }).filter({ hasText: "2,600" })).toContainText(
    "+£2,600.00",
  );
  await add(page, "lunch 8");
  await expect(page.getByRole("listitem").filter({ hasText: "lunch" })).not.toContainText("+");
  await expect(page.locator("header").getByText("£8.00").first()).toBeVisible();
});

test("stats show income, net and savings rate, and break income down by category", async ({ app: page }) => {
  await page.getByRole("link", { name: "Stats", exact: true }).click();
  await expect(page.getByText("Savings rate")).toBeHidden();
  await seed(page, [
    { note: "Pay", amount: "2000", categoryId: salary, date: today() },
    { note: "Rent", amount: "1500", date: today() },
  ]);
  await page.reload();
  const row = page.locator("dl > div");
  await expect(page.getByText("£1,500.00").first()).toBeVisible();
  await expect(row.filter({ hasText: "Income" })).toContainText("£2,000.00");
  await expect(row.filter({ hasText: "Net" })).toContainText("£500.00");
  await expect(row.filter({ hasText: "Savings rate" })).toContainText("25%");
  await page.getByRole("radiogroup", { name: "Breakdown" }).getByRole("radio", { name: "Income" }).click();
  await expect(page.getByRole("link", { name: /Salary/ })).toContainText("£2,000.00");
});

test("an income edit link opens as income even when categories load last", async ({ app: page }) => {
  const [res] = await seed(page, [{ note: "Pay", amount: "3000", categoryId: salary }]);
  const { id } = await res.json();
  let release = () => {};
  const held = new Promise<void>((r) => (release = r));
  await page.route("**/api/categories", async (route) => (await held, route.continue()));
  await page.evaluate(() => localStorage.removeItem("cache"));
  const loaded = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/transactions");
  await page.goto(`/?edit=${id}`);
  await loaded;
  release();
  await expect(page.getByLabel("Note", { exact: true })).toHaveValue("Pay");
  await expect(page.getByRole("heading", { name: "Edit income" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Income" })).toBeChecked();
});
