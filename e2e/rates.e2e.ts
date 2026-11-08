import { expect, seed, test } from "./fixtures";

test("missing rates mark totals incomplete and shared manual rates can be edited and reset", async ({ app: page }) => {
  await seed(page, [{ note: "Unconverted dinner", amount: "10", currency: "JPY" }]);
  await page.reload();
  await expect(page.getByText("Incomplete totals:")).toBeVisible();
  await page.getByRole("button", { name: "Unconverted dinner", exact: true }).click();
  await expect(page.getByText("Missing rate. Add a manual rate in Settings.")).toBeVisible();
  await page.goto("/settings");
  await page.getByLabel("Date", { exact: true }).fill(new Date().toLocaleDateString("en-CA"));
  await page.getByLabel("Currency", { exact: true }).fill("JPY");
  await page.getByLabel("Units per 1 USD").fill("100");
  await page.screenshot({ path: `/tmp/109-rates-${test.info().project.name}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Save manual rate" }).click();
  await expect(page.getByText("Rate updated.", { exact: true })).toHaveText("Rate updated.");
  await page.goto("/");
  await expect(page.getByText("Incomplete totals:")).toBeHidden();
  await page.getByRole("button", { name: "Unconverted dinner", exact: true }).click();
  await expect(page.getByText(/1 USD = 100 JPY/)).toBeVisible();
  await page.goto("/settings");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByLabel("Units per 1 USD")).toHaveValue("100");
  await page.getByRole("button", { name: "Reset to automatic" }).click();
  await expect(page.getByRole("button", { name: "Reset to automatic" })).toBeHidden();
  await page.goto("/stats");
  await expect(page.getByText("Incomplete totals · comparison unavailable")).toBeVisible();
});

test("a missing rate only in the comparison period hides the comparison", async ({ app: page }) => {
  const last = new Date();
  last.setMonth(last.getMonth() - 1);
  last.setDate(1);
  await seed(page, [
    { note: "Current", amount: "10", currency: "GBP" },
    { note: "Previous missing", amount: "100", currency: "JPY", date: last.toLocaleDateString("en-CA") },
  ]);
  await page.reload();
  await expect(page.getByText("Incomplete totals:")).toBeVisible();
  await page.goto("/stats");
  await expect(page.getByText("Incomplete totals · comparison unavailable")).toBeVisible();
});

test("missing income rates hide category, tag and income comparisons", async ({ app: page }) => {
  const response = await page.request.post("/api/categories", { data: { name: "Food", icon: "🍜", color: "#ff9900" } });
  const food = (await response.json()).id;
  const previous = new Date();
  previous.setMonth(previous.getMonth() - 1);
  previous.setDate(1);
  await seed(page, [
    { note: "Pay", amount: "100", categoryId: 2 },
    { note: "Dinner", amount: "10", categoryId: food, tags: ["food"] },
    { note: "Old pay", amount: "50", categoryId: 2, date: previous.toLocaleDateString("en-CA") },
    { note: "Missing pay", amount: "100", categoryId: 2, currency: "JPY", date: previous.toLocaleDateString("en-CA") },
    { note: "Old dinner", amount: "5", categoryId: food, tags: ["food"], date: previous.toLocaleDateString("en-CA") },
  ]);
  await page.goto("/stats");
  await expect(page.getByText("Incomplete totals · comparison unavailable")).toBeVisible();
  await expect(page.locator("dl > div > dd:last-child")).toHaveText(["", "", ""]);
  await expect(page.getByText(/^New since /)).toHaveCount(0);
  await expect(page.getByText(/^vs /)).toHaveCount(0);
  await expect(page.getByText(/^[+−]\d+%$/)).toHaveCount(0);
  await expect(page.getByText("100%", { exact: true })).toHaveCount(1);
});
