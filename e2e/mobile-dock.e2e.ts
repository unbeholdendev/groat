import { bar, expect, seed, test } from "./fixtures";

test("quick add is a solid bottom footer while content scrolls", async ({ app: page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page, Array.from({ length: 18 }, (_, i) => ({ note: `Expense ${i}`, amount: "1" })));
  await page.reload();
  const dock = page.getByRole("contentinfo");
  await expect.poll(() => dock.evaluate((el) => Math.round(el.getBoundingClientRect().bottom))).toBe(844);
  expect(await dock.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
  await page.screenshot({ path: `/tmp/groat-footer-full-${testInfo.project.name}.png` });
  const input = bar(page);
  await input.fill("Coffee 3");
  await page.setViewportSize({ width: 390, height: 480 });
  await expect(input).toBeFocused();
  await expect.poll(() => dock.evaluate((el) => Math.round(el.getBoundingClientRect().bottom))).toBe(480);
  await expect(input).toHaveValue("Coffee 3");
  await page.locator("main").evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect(input).toBeInViewport();
  await page.evaluate(() => {
    Object.defineProperty(visualViewport!, "height", { configurable: true, value: 320 });
    Object.defineProperty(visualViewport!, "offsetTop", { configurable: true, value: 30 });
    visualViewport!.dispatchEvent(new Event("resize"));
  });
  await expect.poll(() => dock.evaluate((el) => Math.round(el.getBoundingClientRect().bottom))).toBe(350);
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("Coffee 3");
  await page.evaluate(() => {
    Reflect.deleteProperty(visualViewport!, "height");
    Reflect.deleteProperty(visualViewport!, "offsetTop");
    visualViewport!.dispatchEvent(new Event("resize"));
  });
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.screenshot({ path: `/tmp/groat-mobile-dock-${testInfo.project.name}.png` });
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
    await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Recurring", exact: true })).toBeVisible();
  }
  await expect(page.getByRole("link", { name: "Privacy and data flows" })).toBeVisible();
});

test("desktop quick add has a rounded footer clear of the window edge", async ({ app: page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  const dock = page.getByRole("contentinfo");
  const shape = await dock.evaluate((el) => {
    const style = getComputedStyle(el);
    return { radius: parseFloat(style.borderTopLeftRadius), bottom: el.getBoundingClientRect().bottom };
  });
  expect(shape.radius).toBeGreaterThan(0);
  expect(shape.bottom).toBeLessThan(800);
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
