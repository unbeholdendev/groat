import { expect, seed, test } from "./fixtures";

test("create, rename, reorder and delete a category, moving its expenses", async ({ app: page }) => {
  await seed(page, [{ note: "Vet", amount: "60", categoryId: 2 }]);
  await page.getByRole("link", { name: "Categories" }).click();
  await page.getByRole("button", { name: "New category" }).click();
  await page.getByLabel("Emoji").fill("🐶");
  await page.getByLabel("Name").fill("Pets");
  await page.getByRole("button", { name: "Add" }).click();
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
  await expect(page.getByText("1 expense (subcategories included) will move to")).toBeVisible();
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
