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
  expect((await (await page.request.get("/api/transactions")).json()).length).toBe(1);
});

test("an expense without a rate shows as unconverted and stays out of the day total", async ({ app: page }) => {
  await seed(page, [
    { note: "Sushi", amount: "3000", currency: "JPY" },
    { note: "Tea", amount: "2" },
  ]);
  await page.reload();
  await expect(page.getByRole("listitem").filter({ hasText: "Sushi" })).toContainText("Missing rate");
  await expect(page.getByText("£2.00 + 1 without rates · incomplete")).toBeVisible();
});

test("/ focuses the bar", async ({ app: page, isMobile }) => {
  test.skip(isMobile, "keyboard only");
  await expect(bar(page)).toBeVisible();
  await expect(bar(page)).toHaveAttribute("aria-keyshortcuts", "/");
  await expect(page.locator("kbd").filter({ hasText: /^\/$/ })).toHaveCount(0);
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
  await expect(page.getByText("£32.00 every month")).toBeVisible();
});

test("clearing Repeat stops a recurring expense", async ({ app: page }) => {
  await page.request.post("/api/recurring", { data: { note: "Gym", amount: "30", currency: "GBP", period: "month", every: 1, startDate: "2026-01-01" } });
  await page.goto("/?view=recurring");
  await page.getByRole("button", { name: /Gym/ }).click();
  await page.getByLabel("Repeat").selectOption("");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Nothing repeats yet.", { exact: false })).toBeVisible();
});

test("Stats says when From is after To", async ({ app: page }) => {
  await page.goto("/stats?from=2026-05-10&to=2026-05-01");
  await expect(page.getByText("From is after To.")).toBeVisible();
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
  expect((await (await page.request.get("/api/transactions")).json()).length).toBe(1);
});

test("a long note truncates and keeps the amount in view", async ({ app: page }) => {
  await add(page, "annual flights and hotels for the whole family to lisbon 1234.50");
  const row = page.getByRole("listitem").filter({ hasText: "annual flights" });
  const amount = row.getByText("£1,234.50");
  await expect(amount).toBeInViewport();
  const [r, a] = await Promise.all([row.boundingBox(), amount.boundingBox()]);
  expect(a!.x + a!.width).toBeLessThanOrEqual(r!.x + r!.width);
});

test("swiping a row left bins it, and Undo brings it back", async ({ app: page }) => {
  await seed(page, [{ note: "Mistake", amount: "1" }]);
  await page.reload();
  const row = page.getByRole("listitem").filter({ hasText: "Mistake" }).locator("div").first();
  const b = (await row.boundingBox())!;
  const at = (dx: number) => ({ clientX: b.x + b.width - 20 + dx, clientY: b.y + 30, pointerType: "touch", isPrimary: true });
  await row.dispatchEvent("pointerdown", at(0));
  await row.dispatchEvent("pointermove", at(-60));
  await row.dispatchEvent("pointerup", at(-60));
  await expect(page.getByRole("button", { name: "Mistake" })).toBeVisible();
  await row.dispatchEvent("pointerdown", at(0));
  await row.dispatchEvent("pointermove", at(-140));
  await row.dispatchEvent("pointerup", at(-140));
  await expect(page.getByRole("button", { name: "Mistake" })).toBeHidden();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("button", { name: "Mistake" })).toBeVisible();
});

test("a cache saved by an older build is dropped, not rendered", async ({ app: page }) => {
  await page.addInitScript(() => {
    const old = { queryKey: ["/api/settings"], queryHash: '["/api/settings"]', state: { data: { baseCurrency: "GBP", currencies: ["GBP"], lastCurrency: "GBP", theme: "system", onboarded: true }, dataUpdatedAt: Date.now(), status: "success", fetchStatus: "idle" } };
    localStorage.setItem("cache", JSON.stringify({ mutations: [], queries: [old] }));
  });
  await page.reload();
  await bar(page).fill("tea 2");
  await expect(page.getByText("Nothing this month yet")).toBeVisible();
});
