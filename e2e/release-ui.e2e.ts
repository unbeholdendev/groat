import { expect, seed, test } from "./fixtures";

test.use({ serviceWorkers: "block" });

test("dirty expense navigation can stay or discard", async ({ app: page }) => {
  await page.getByRole("button", { name: "Full form" }).click();
  await page.getByLabel("Note", { exact: true }).fill("Unsaved train");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Discard expense changes?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Keep editing" }).click();
  await expect(page.getByLabel("Note", { exact: true })).toHaveValue("Unsaved train");
  await page.getByRole("link", { name: "Stats", exact: true }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Discard changes" }).click();
  await expect(page.getByRole("heading", { name: "New expense" })).toBeHidden();
});

test("stats comparisons have a keyboard accessible table and legend", async ({ app: page }) => {
  await seed(page, [{ note: "Train", amount: "12" }]);
  await page.getByRole("link", { name: "Stats", exact: true }).click();
  await expect(page.getByText("Cumulative spending", { exact: true }).first()).toBeVisible();
  await page.getByText("Compare daily totals", { exact: true }).click();
  await expect(page.getByRole("table", { name: "Cumulative spending by day" })).toBeVisible();
});

test.describe("receipt review", () => {
  test.use({ ai: true });
  test("enlarging a receipt preserves edits and returns focus", async ({ app: page }) => {
    await page.locator('input[type="file"]').setInputFiles({ name: "receipt.png", mimeType: "image/png", buffer: await page.screenshot() });
    const review = page.getByRole("region", { name: "Review expense" });
    await review.getByLabel("Note", { exact: true }).fill("Checked receipt");
    await review.getByRole("button", { name: "Enlarge receipt" }).click();
    const dialog = page.getByRole("dialog", { name: "Receipt", exact: true });
    await expect(dialog.getByAltText("Full receipt")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(review.getByRole("button", { name: "Enlarge receipt" })).toBeFocused();
    await expect(review.getByLabel("Note", { exact: true })).toHaveValue("Checked receipt");
    await review.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("button", { name: "Checked receipt", exact: true })).toBeVisible();
  });
});

test("voice configuration keeps manual entry available", async ({ app: page }) => {
  await page.route("**/api/settings", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...await response.json(), voice: true } });
  });
  await page.reload();
  await expect(page.getByRole("button", { name: "Dictate", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Full form", exact: true }).click();
  await expect(page.getByRole("heading", { name: "New expense" })).toBeVisible();
});

test("dirty edits survive back and a cancelled reload, then save without a prompt", async ({ app: page, browserName }) => {
  await seed(page, [{ note: "Train", amount: "12" }]);
  await page.reload();
  await page.getByRole("button", { name: "Train", exact: true }).click();
  await page.getByLabel("Amount", { exact: true }).fill("15");
  await page.goBack();
  const dialog = page.getByRole("dialog", { name: "Discard expense changes?" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  if (browserName === "webkit") {
    page.once("dialog", (dialog) => void dialog.accept());
    await page.reload();
    await expect(page.getByRole("status").filter({ hasText: "Recovered unsaved expense" })).toBeVisible();
  } else {
  const unload = page.waitForEvent("dialog");
  const reload = page.reload({ timeout: 2000 }).catch(() => {});
  const prompt = await unload;
  expect(prompt.type()).toBe("beforeunload");
  await prompt.dismiss();
  await reload;
  }
  await expect(page.getByLabel("Amount", { exact: true })).toHaveValue("15");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Train" })).toContainText("£15.00");
  await expect(dialog).toBeHidden();
});

test("a new unsaved expense survives a reload and is removed after saving", async ({ app: page }) => {
  await page.getByRole("button", { name: "Full form", exact: true }).click();
  await page.getByLabel("Note", { exact: true }).fill("Recover this draft");
  await page.getByLabel("Amount", { exact: true }).fill("8.50");
  page.on("dialog", (dialog) => void dialog.accept());
  await page.reload();
  await expect(page.getByLabel("Note", { exact: true })).toHaveValue("Recover this draft");
  await expect(page.getByLabel("Amount", { exact: true })).toHaveValue("8.50");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("button", { name: "Recover this draft", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Full form", exact: true }).click();
  await expect(page.getByLabel("Note", { exact: true })).toHaveValue("");
});

test("long amounts remain fully visible on a small phone", async ({ app: page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.getByRole("button", { name: "Full form", exact: true }).click();
  const amount = page.getByLabel("Amount", { exact: true });
  await amount.fill("1234567.89");
  expect(await amount.evaluate((input) => input.scrollWidth <= input.clientWidth + 1)).toBe(true);
});

test("reverting an edit clears its obsolete recovery draft", async ({ app: page }) => {
  await seed(page, [{ note: "Train", amount: "12" }]);
  await page.reload();
  await page.getByRole("button", { name: "Train", exact: true }).click();
  await page.getByLabel("Amount", { exact: true }).fill("15");
  await page.getByLabel("Amount", { exact: true }).fill("12.00");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Train", exact: true }).click();
  await expect(page.getByLabel("Amount", { exact: true })).toHaveValue("12.00");
  await expect(page.getByRole("status").filter({ hasText: "Recovered unsaved expense" })).toHaveCount(0);
});

test("the accessible comparison includes the full previous period and its actual dates", async ({ app: page }) => {
  const now = new Date();
  const last = new Date(now.getFullYear(), now.getMonth(), 0);
  await seed(page, [{ note: "Previous closing expense", amount: "19", date: last.toLocaleDateString("en-CA") }]);
  await page.goto("/stats");
  const toggle = page.getByText("Compare daily totals", { exact: true });
  await toggle.focus();
  await toggle.press("Enter");
  const table = page.getByRole("table", { name: "Cumulative spending by day" });
  await expect(table.getByRole("row")).toHaveCount(Math.max(now.getDate(), last.getDate()) + 1);
  const closing = table.getByRole("row").filter({ hasText: last.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) });
  await expect(closing).toContainText("£19.00");
  if (now.getDate() < last.getDate()) await expect(closing).toContainText("Outside current range");
});
