import { bar, expect, test } from "./fixtures";

test.use({ ai: true });

test("a new line goes to AI and saves from the review card", async ({ app: page }) => {
  await bar(page).fill("corner shop");
  await expect(page.getByText("Press Enter and AI reads it for you to check.")).toBeVisible();
  await bar(page).press("Enter");
  const card = page.getByRole("region", { name: "Review expense" });
  await expect(card.getByLabel("Amount")).toHaveValue("9.99");
  await expect(card.getByRole("button", { name: "Save" })).toBeInViewport({ ratio: 1 });
  await card.getByLabel("Note").fill("Corner shop");
  await card.getByRole("button", { name: "Save" }).click();
  await expect(card).toBeHidden();
  await expect(page.getByRole("listitem").filter({ hasText: "Corner shop" })).toContainText("£9.99");
});

test("? asks, and the answer continues in chat", async ({ app: page }) => {
  await bar(page).fill("?where does it go");
  await bar(page).press("Enter");
  await expect(page.getByText("Mostly on food.")).toBeVisible();
  await page.getByRole("button", { name: "Continue in chat" }).click();
  await expect(page.getByRole("heading", { name: "where does it go" })).toBeVisible();
  await bar(page).fill("and last month?");
  await bar(page).press("Enter");
  await expect(page.getByText("Mostly on food.")).toHaveCount(2);
  await page.getByRole("button", { name: "Chats" }).click();
  await expect(page.getByRole("button", { name: "where does it go" })).toBeVisible();
});
