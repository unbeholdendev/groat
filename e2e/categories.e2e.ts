import { expect, seed, test } from "./fixtures";

test("create, rename, reorder and delete a category, moving its expenses", async ({ app: page }) => {
  await seed(page, [{ note: "Vet", amount: "60", categoryId: 4 }]);
  await page.getByRole("link", { name: "Categories" }).click();
  await page.getByRole("button", { name: "New expense category" }).click();
  await page.getByLabel("Emoji").fill("🐶");
  await page.getByLabel("Name").fill("Pets");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pets" })).toBeVisible();

  await page.getByRole("button", { name: "Pets" }).click();
  await page.getByLabel("Name").fill("Pet care");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("button", { name: "Pet care" })).toBeVisible();

  await page.getByRole("button", { name: "Reorder" }).click();
  const names = () => page.getByRole("listitem").locator("button span.truncate").allTextContents();
  const before = await names();
  await page.getByRole("button", { name: "Move up" }).nth(before.indexOf("Pet care")).click();
  await expect.poll(async () => (await names()).indexOf("Pet care")).toBeLessThan(before.indexOf("Pet care"));
  await page.getByRole("button", { name: "Done" }).click();

  await page.getByRole("button", { name: "Food", exact: true }).click();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("1 entry (subcategories included) will move to")).toBeVisible();
  await page.getByLabel(/will move to/).selectOption({ label: "🐶 Pet care" });
  await page.getByRole("button", { name: "Delete Food" }).click();
  await expect(page.getByRole("button", { name: "Food", exact: true })).toBeHidden();

  await page.getByRole("link", { name: "Expenses" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Vet" })).toContainText("Pet care");
});

test("rename and delete a tag", async ({ app: page }) => {
  await seed(page, [{ note: "Pizza", amount: "20", tags: ["friends"] }]);
  await page.getByRole("link", { name: "Categories" }).click();
  await page.getByRole("button", { name: "#friends", exact: true }).click();
  await page.getByLabel("Rename #friends").fill("mates");
  await page.getByLabel("Rename #friends").press("Enter");
  await expect(page.getByRole("button", { name: "#mates", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Delete #mates" }).click();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("No tags yet.")).toBeVisible();
});

test("parents with subcategories show they expand", async ({ app: page }) => {
  await page.getByRole("button", { name: "Full form" }).click();
  const grid = page.getByRole("group", { name: "Category", exact: true });
  await expect(grid.getByRole("button", { name: "Subscriptions" })).not.toHaveAttribute("aria-expanded");
  await expect(grid.getByRole("button", { name: "Food" })).toHaveAttribute("aria-expanded", "false");
  await grid.getByRole("button", { name: "Food" }).click();
  await page.getByRole("group", { name: "Subcategory" }).getByRole("button", { name: "Groceries" }).click();
  await expect(grid.getByRole("button", { name: "Food" })).toHaveAttribute("aria-expanded", "true");
});
