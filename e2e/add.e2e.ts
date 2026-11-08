import { add, bar, expect, seed, test } from "./fixtures";

test("one line adds a row, updates the total and can be undone", async ({ app: page }) => {
  await add(page, "coffee 3.20");
  const row = page.getByRole("button", { name: "coffee" });
  await expect(row).toBeVisible();
  await expect(page.locator("header").getByText("£3.20").first()).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(row).toBeHidden();
  await expect(page.getByText("Nothing this month yet")).toBeVisible();
});

test("tags, currencies and sats parse from the line", async ({ app: page }) => {
  await add(page, "ramen 24.50 #friends");
  await expect(page.getByText("#friends")).toBeVisible();
  await add(page, "beer 10 EUR");
  await expect(page.getByRole("listitem").filter({ hasText: "beer" })).toContainText("€10.00");
  await expect(page.getByRole("listitem").filter({ hasText: "beer" })).toContainText("£8.89");
  await add(page, "tip 5000 sats");
  await expect(page.getByRole("listitem").filter({ hasText: "tip" })).toContainText("0.00005000 BTC");
  await page.getByRole("button", { name: "Full form" }).click();
  const options = page.getByLabel("Currency").locator("option");
  for (const [i, code] of ["BTC", "EUR", "GBP", "AED"].entries()) await expect(options.nth(i)).toHaveText(code);
});

test("the currency chip sets the currency on the line", async ({ app: page }) => {
  await bar(page).fill("beer 10");
  await page.getByLabel("Currency").selectOption("EUR");
  await expect(bar(page)).toHaveValue("beer 10 EUR");
  await page.getByLabel("Currency").selectOption("USD");
  await expect(bar(page)).toHaveValue("beer 10 USD");
});

test("past notes fill amount and category", async ({ app: page }) => {
  await seed(page, [{ note: "ramen", amount: "12.00", categoryId: 5, date: "2026-01-05" }]);
  await page.reload();
  await bar(page).fill("ra");
  await expect(page.getByRole("button", { name: /ramen/ })).toBeVisible();
  await bar(page).press("Tab");
  await expect(bar(page)).toHaveValue("ramen 12.00 ");
  await expect(page.getByLabel("Category")).toHaveValue("5");
  await bar(page).press("Enter");
  await expect(page.getByRole("listitem").filter({ hasText: "ramen" })).toContainText("Groceries");
});

test("a line's amount can be a sum", async ({ app: page }) => {
  await bar(page).fill("ramen 12+3.5");
  await expect(page.locator("form[aria-label='Quick add']").getByText("12+3.5")).toBeVisible();
  await bar(page).press("Enter");
  await expect(page.getByRole("listitem").filter({ hasText: "ramen" })).toContainText("£15.50");
});

test("the full form's amount can be a sum", async ({ app: page }) => {
  await page.getByRole("button", { name: "Full form" }).click();
  await page.getByLabel("Amount").fill("3-5");
  await page.getByLabel("Note").fill("Pizza");
  await expect(page.getByLabel("Amount")).toHaveValue("3-5");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Enter an amount")).toBeVisible();
  await page.getByLabel("Amount").fill("100/3");
  await page.getByLabel("Note").click();
  await expect(page.getByLabel("Amount")).toHaveValue("33.33");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Pizza" })).toContainText("£33.33");
});

test("a line without an amount opens the full form", async ({ app: page }) => {
  await bar(page).fill("#nope");
  await expect(page.getByRole("button", { name: "Full form" })).toHaveCount(1);
  await page.getByRole("button", { name: "Full form" }).click();
  await expect(page.getByRole("heading", { name: "New expense" })).toBeVisible();
});

test("Enter on an empty bar does nothing; the plus opens the full form", async ({ app: page }) => {
  await bar(page).press("Enter");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("button", { name: "Full form" })).toHaveCount(1);
  await page.getByRole("button", { name: "Full form" }).click();
  await expect(page.getByRole("heading", { name: "New expense" })).toBeVisible();
});

test("Cancel returns to the page the form was opened from", async ({ app: page }) => {
  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Full form" }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page).toHaveURL(/\/settings$/);
});

test("Cancel on a directly opened form goes to the list", async ({ app: page }) => {
  await page.goto("/?new=1");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("Nothing this month yet")).toBeVisible();
});

test("full form adds, edits, bins and restores", async ({ app: page }) => {
  await page.getByRole("button", { name: "Full form" }).click();
  await page.getByLabel("Note").fill("Train");
  await page.getByLabel("Amount").fill("42");
  await page.getByRole("button", { name: "Transport", exact: true }).click();
  await page.getByRole("button", { name: "Public transport" }).click();
  await page.getByLabel("Tags").fill("work, trip");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const row = page.getByRole("listitem").filter({ hasText: "Train" });
  await expect(row).toContainText("£42.00");
  await expect(row).toContainText("#work");

  await page.getByRole("button", { name: "Train" }).click();
  await expect(page.getByRole("heading", { name: "Edit expense" })).toBeVisible();
  await page.getByLabel("Amount").fill("40");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(row).toContainText("£40.00");

  await page.getByRole("button", { name: "Train" }).click();
  await page.getByRole("button", { name: "Move to bin" }).click();
  await expect(row).toBeHidden();

  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("main").getByRole("link", { name: "Bin" }).click();
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(page.getByText("The bin is empty.")).toBeVisible();
  await page.getByRole("link", { name: "Expenses" }).click();
  await expect(row).toBeVisible();
});

test("the total counts up through real amounts", async ({ app: page }) => {
  await seed(page, [{ note: "Rent", amount: "900" }]);
  await page.reload();
  const shown = page.locator("header b [aria-hidden]").first();
  const seen: string[] = [];
  for (let i = 0; i < 10; i++) {
    seen.push((await shown.textContent()) ?? "");
    await page.waitForTimeout(80);
  }
  expect(seen.filter((t) => !/^£[\d,]+\.\d\d$/.test(t))).toEqual([]);
});

test("without AI the camera and mic show dimmed and say why", async ({ app: page }) => {
  await page.getByRole("button", { name: "Dictate" }).click({ force: true });
  await expect(page.getByText("Dictation isn't set up on this server.")).toBeVisible();
  await page.getByRole("button", { name: "Add from a photo" }).click({ force: true });
  await expect(page.getByText("Receipt photos aren't set up on this server.")).toBeVisible();
  await bar(page).fill("?where");
  await expect(page.getByText("Asking isn't set up on this server.")).toBeVisible();
});

test("saves over plain HTTP, where crypto.randomUUID is missing", async ({ app: page }) => {
  await page.addInitScript(() => delete (Crypto.prototype as Partial<Crypto>).randomUUID);
  await page.reload();
  await add(page, "coffee 3.20");
  await expect(page.getByRole("button", { name: "coffee" })).toBeVisible();
});
