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
  await expect(page.getByRole("button", { name: "Next month" })).toBeDisabled();

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

  await page.getByRole("link", { name: "Stats", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Stats" })).toBeVisible();
  await expect(page.locator("section").first()).toContainText("£42.00");
  await page.getByRole("button", { name: /Food/ }).click();
  await page.getByRole("link", { name: /Groceries/ }).first().click();
  await expect(page.getByRole("heading", { name: "Filtered" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Groceries run" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cinema" })).toBeHidden();

  await page.getByRole("link", { name: "Stats", exact: true }).click();
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
  await page.request.put("/api/settings", { data: { baseCurrency: "BTC" } });
  await page.request.post("/api/expenses", { data: { note: "Coffee", amount: "1375", currency: "GBP", date: new Date().toLocaleDateString("en-CA") } });
  await page.goto("/stats");
  const total = page.locator("section").first().locator("b").first();
  await expect(total).toContainText("BTC");
  expect(await total.evaluate((b) => b.scrollWidth <= b.clientWidth)).toBe(true);
});

test("swiping the hero steps months", async ({ app: page }) => {
  const hero = page.locator("header").first();
  const box = (await hero.boundingBox())!;
  const drag = async (from: number, to: number) => {
    await hero.dispatchEvent("pointerdown", { clientX: box.x + from, clientY: box.y + 100, pointerId: 1, isPrimary: true });
    await hero.dispatchEvent("pointerup", { clientX: box.x + to, clientY: box.y + 110, pointerId: 1, isPrimary: true });
  };
  const month = (n: number) => new Date(new Date().getFullYear(), new Date().getMonth() + n, 1).toLocaleDateString("en-GB", { month: "long" });
  await drag(40, 260);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(month(-1));
  await drag(260, 40);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(month(0));
  await drag(260, 40);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(month(0));
});

test("scrubbing the spend line reads out a day", async ({ app: page }) => {
  await page.request.post("/api/expenses", { data: { note: "Coffee", amount: "3.20", currency: "GBP", date: new Date().toLocaleDateString("en-CA") } });
  await page.goto("/stats");
  const chart = page.getByRole("img", { name: /so far/ }).locator("..");
  const b = (await chart.boundingBox())!;
  await chart.dispatchEvent("pointerdown", { clientX: b.x + b.width - 2, clientY: b.y + 50, pointerType: "touch" });
  await expect(page.locator("section").first()).toContainText(`${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · £3.20`);
  await chart.dispatchEvent("pointerup", { pointerType: "touch" });
  await expect(page.locator("section").first()).not.toContainText("· £3.20");
});

test("changing period clears a scrub readout", async ({ app: page }) => {
  await page.request.post("/api/expenses", { data: { note: "Coffee", amount: "3.20", currency: "GBP", date: new Date().toLocaleDateString("en-CA") } });
  await page.goto("/stats");
  const chart = page.getByRole("img", { name: /so far/ }).locator("..");
  const b = (await chart.boundingBox())!;
  await chart.dispatchEvent("pointermove", { clientX: b.x + b.width - 2, clientY: b.y + 50, pointerType: "mouse" });
  await expect(page.locator("section").first()).toContainText("· £3.20");
  await page.getByRole("radio", { name: "Last month" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("section").first()).not.toContainText("· £3.20");
});

test("the desktop side column switches between amounts and shares", async ({ app: page }, info) => {
  test.skip(info.project.name === "phone");
  await seed(page, [
    { note: "Groceries run", amount: "30", categoryId: 3 },
    { note: "Cinema", amount: "10", categoryId: 16 },
  ]);
  await page.reload();
  const aside = page.locator("aside");
  await expect(aside).toContainText("£30.00");
  await aside.getByRole("radio", { name: "Share" }).click();
  await expect(aside).toContainText("75%");
  await expect(aside).toContainText("25%");
  await expect(aside).not.toContainText("£30.00");
});
