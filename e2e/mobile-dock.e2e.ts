import { bar, expect, seed, test } from "./fixtures";

test("expense input sits below the chart and the mobile shortcut returns to its draft", async ({ app: page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(
    page,
    Array.from({ length: 18 }, (_, i) => ({ note: `Expense ${i}`, amount: "1" })),
  );
  await page.reload();
  const input = bar(page);
  const dock = page.getByRole("contentinfo");
  await expect(input).toHaveCount(1);
  await expect(dock.getByRole("textbox")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Add expense" })).toHaveCount(0);
  await expect(input).toHaveAttribute("placeholder", "Add an expense");
  const header = await page.locator("main header").boundingBox();
  const field = await input.boundingBox();
  expect(field!.y).toBeGreaterThan(header!.y + header!.height);
  await expect(page.getByRole("button", { name: "Full form", exact: true })).toBeEnabled();
  const shortcut = page.getByRole("button", { name: "Add expense", exact: true });
  await expect(shortcut).toBeHidden();
  await input.fill("Coffee 3");
  await page.locator("main").evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect(input).not.toBeInViewport();
  await expect(shortcut).toBeVisible();
  await shortcut.click();
  await expect(input).toBeFocused();
  await expect(input).toBeInViewport();
  await expect(input).toHaveValue("Coffee 3");
  await expect(shortcut).toBeHidden();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(input).toHaveValue("");
  await expect(page.getByRole("button", { name: "Coffee", exact: true })).toBeVisible();
  await expect.poll(() => dock.evaluate((el) => Math.round(el.getBoundingClientRect().bottom))).toBe(844);
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(input).toBeInViewport();
});

test("settings only repeats secondary navigation on phones", async ({ app: page }, testInfo) => {
  await page.goto("/settings");
  const more = page.getByRole("heading", { name: "More", exact: true });
  if (testInfo.project.name === "phone") {
    await expect(more).toBeVisible();
    await expect(page.locator("main").getByRole("link", { name: "Recurring", exact: true })).toBeVisible();
  } else {
    await expect(more).toBeHidden();
    await expect(page.locator("main").getByRole("link", { name: "Recurring", exact: true })).toBeHidden();
    await expect(
      page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Recurring", exact: true }),
    ).toBeVisible();
  }
  await expect(page.getByRole("link", { name: "Privacy and data flows" })).toBeVisible();
});

test("desktop quick add is in the page without an empty footer", async ({ app: page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  const dock = page.getByRole("contentinfo");
  await expect(dock).toHaveCSS("display", "contents");
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  await bar(page).fill("Coffee 3");
  await expect(bar(page)).toBeFocused();
  await expect(page.getByRole("button", { name: "Add", exact: true })).toBeVisible();
  await page.screenshot({ path: "/tmp/groat-desktop-dock-light.png" });
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.screenshot({ path: "/tmp/groat-desktop-dock-dark.png" });
  await bar(page).press("Enter");
  await expect(bar(page)).toHaveValue("");
});
