import { add, bar, expect, seed, test } from "./fixtures";

test("adds made offline wait on the device and sync when back", async ({ app: page, context }) => {
  await expect(page.getByText("Nothing this month yet")).toBeVisible();
  await context.setOffline(true);
  await add(page, "bus 2.80");
  await expect(page.getByRole("listitem").filter({ hasText: "bus" })).toContainText("Will sync");
  await context.setOffline(false);
  await expect(page.getByRole("listitem").filter({ hasText: "bus" })).not.toContainText("Will sync");
  await page.reload();
  await expect(page.getByRole("button", { name: "bus" })).toHaveCount(1);
  expect((await (await page.request.get("/api/expenses")).json()).length).toBe(1);
});

test("a currency without a rate can be given one by hand", async ({ app: page }) => {
  await page.request.put("/api/settings", { data: { currencies: ["EUR", "JPY"] } });
  await seed(page, [{ note: "Sushi", amount: "3000", currency: "JPY" }]);
  await page.reload();
  const row = page.getByRole("listitem").filter({ hasText: "Sushi" });
  await row.getByRole("button", { name: "Set rate" }).click();
  await page.getByLabel("1 USD in JPY").fill("150");
  await page.getByLabel("1 USD in GBP").fill("0.8");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(row).toContainText("£16.00");
});

test("/ focuses the bar", async ({ app: page, isMobile }) => {
  test.skip(isMobile, "keyboard only");
  await page.locator("body").press("/");
  await expect(bar(page)).toBeFocused();
});

test("bin empties for good", async ({ app: page }) => {
  await seed(page, [{ note: "Mistake", amount: "1" }]);
  await page.reload();
  await page.getByRole("button", { name: "Mistake" }).click();
  await page.getByRole("button", { name: "Move to bin" }).click();
  await page.goto("/?view=bin");
  await page.getByRole("button", { name: "Empty bin" }).click();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("The bin is empty.")).toBeVisible();
});

test("a recurring expense can be edited", async ({ app: page }) => {
  await page.request.post("/api/recurring", { data: { note: "Gym", amount: "30", currency: "GBP", period: "month", every: 1, startDate: "2026-01-01" } });
  await page.goto("/?view=recurring");
  await page.getByRole("button", { name: /Gym/ }).click();
  await expect(page.getByRole("heading", { name: "Edit recurring" })).toBeVisible();
  await page.getByLabel("Amount").fill("32");
  await page.getByRole("button", { name: "Save" }).click();
  await page.goto("/?view=recurring");
  await expect(page.getByText("£32.00 every month")).toBeVisible();
});

test.describe("with AI", () => {
  test.use({ ai: true });

  test("a photo becomes a draft to review", async ({ app: page }) => {
    await page.locator('input[type="file"]').setInputFiles("web/public/icon-192.png");
    const card = page.getByRole("region", { name: "Review expense" });
    await expect(card.getByLabel("Amount")).toHaveValue("9.99");
    await expect(card.getByRole("img", { name: "Receipt" })).toBeVisible();
    await card.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("button", { name: "Corner shop" })).toBeVisible();
  });

  test("Escape dismisses the review card", async ({ app: page }) => {
    await bar(page).fill("corner shop");
    await bar(page).press("Enter");
    const card = page.getByRole("region", { name: "Review expense" });
    await expect(card.getByLabel("Amount")).toHaveValue("9.99");
    await card.getByLabel("Note").press("Escape");
    await expect(card).toBeHidden();
  });

  test("a chat can be deleted", async ({ app: page }) => {
    await page.request.post("/api/chats", { data: { message: "how much?" } });
    await page.goto("/chat");
    await page.getByRole("button", { name: "how much?" }).click();
    await page.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("No chats yet.")).toBeVisible();
  });
});
test("reload right after reconnecting does not post twice", async ({ app: page, context }) => {
  await expect(page.getByText("Nothing this month yet")).toBeVisible();
  await context.setOffline(true);
  await add(page, "bus 2.80");
  await page.waitForTimeout(500);
  const posted = page.waitForResponse((r) => r.request().method() === "POST");
  await context.setOffline(false);
  await posted;
  await page.reload();
  await page.waitForTimeout(1500);
  expect((await (await page.request.get("/api/expenses")).json()).length).toBe(1);
});

test("a long note truncates and keeps the amount in view", async ({ app: page }) => {
  await add(page, "annual flights and hotels for the whole family to lisbon 1234.50");
  const row = page.getByRole("listitem").filter({ hasText: "annual flights" });
  const amount = row.getByText("£1,234.50");
  await expect(amount).toBeInViewport();
  const [r, a] = await Promise.all([row.boundingBox(), amount.boundingBox()]);
  expect(a!.x + a!.width).toBeLessThanOrEqual(r!.x + r!.width);
});
