import { add, expect, test } from "./fixtures";

test("capture without AI and find the privacy document from Settings", async ({ app: page }) => {
  const settings = await page.request.get("/api/settings");
  expect(await settings.json()).toMatchObject({ ai: false, vision: false, voice: false });
  await add(page, "coffee 3.20");
  await expect(page.getByRole("button", { name: "coffee", exact: true })).toBeVisible();
  await page.goto("/settings");
  await page.getByRole("link", { name: "Privacy and data flows" }).click();
  await expect(page).toHaveURL(/\/privacy\.html$/);
  await expect(page.getByRole("heading", { name: "Privacy and data flows", exact: true })).toBeVisible();
  for (const name of ["Member access", "AI requests", "Browser storage and sign-out", "Server storage and rate lookups", "Using Groat without AI"]) {
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.context().setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Privacy and data flows", exact: true })).toBeVisible();
  await page.context().setOffline(false);
  await page.getByRole("link", { name: "Back to Settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);
});
