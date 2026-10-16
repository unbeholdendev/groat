import { expect, seed, test, today } from "./fixtures";

const lastMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() - 1, 5).toLocaleDateString("en-CA");
};

test("month steps, filters and the stats drill-down", async ({ app: page }) => {
  await seed(page, [
    { note: "Groceries run", amount: "30", categoryId: 3, tags: ["home"] },
    { note: "Cinema", amount: "12", categoryId: 16 },
    { note: "Old lunch", amount: "8", categoryId: 4, date: lastMonth() },
  ]);
  await page.reload();
  const header = page.locator("header");
  await expect(header.getByText("£42.00").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Next month" })).toBeHidden();

  await page.getByRole("button", { name: "Previous month" }).click();
  await expect(page.getByRole("button", { name: "Old lunch" })).toBeVisible();
  await expect(header.getByText("£8.00").first()).toBeVisible();
  await page.getByRole("button", { name: "Next month" }).click();
  await expect(page.getByRole("button", { name: "Cinema" })).toBeVisible();

  await page.getByRole("button", { name: "Filters" }).click();
  await page.getByLabel("Search").fill("cine");
  await expect(page.getByRole("heading", { name: "Filtered" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Groceries run" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Filters, 1 on" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Export CSV" })).toHaveAttribute("href", /q=cine/);
  await page.getByRole("button", { name: "Clear filters" }).first().click();
  await expect(page.getByRole("button", { name: "Groceries run" })).toBeVisible();

  await page.getByRole("link", { name: "Stats" }).click();
  await expect(page.getByRole("heading", { name: "Stats" })).toBeVisible();
  await expect(page.locator("section").first()).toContainText("£42.00");
  await page.getByRole("button", { name: /Food/ }).click();
  await page.getByRole("link", { name: /Groceries/ }).first().click();
  await expect(page.getByRole("heading", { name: "Filtered" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Groceries run" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cinema" })).toBeHidden();

  await page.getByRole("link", { name: "Stats" }).click();
  await page.getByRole("radio", { name: "Last month" }).click();
  await expect(page.locator("section").first()).toContainText("£8.00");
  await page.getByRole("radio", { name: "Custom" }).click();
  await page.getByLabel("From", { exact: true }).fill(lastMonth());
  await page.getByLabel("To", { exact: true }).fill(today());
  await expect(page.locator("section").first()).toContainText("£50.00");
  await page.getByRole("link", { name: "home" }).click();
  await expect(page.getByRole("button", { name: "Groceries run" })).toBeVisible();
});

test("a bitcoin total fits the Stats card", async ({ app: page }) => {
  await page.request.put("/api/settings", { data: { baseCurrency: "BTC", currencies: ["GBP"] } });
  await page.request.post("/api/expenses", { data: { note: "Coffee", amount: "1375", currency: "GBP", date: new Date().toLocaleDateString("en-CA") } });
  await page.goto("/stats");
  const total = page.locator("section").first().locator("b").first();
  await expect(total).toContainText("BTC");
  expect(await total.evaluate((b) => b.scrollWidth <= b.clientWidth)).toBe(true);
});
