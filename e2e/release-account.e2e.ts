import { expect, test } from "./fixtures";

test.use({ serviceWorkers: "block" });

test("change password and sign in with the new password", async ({ app: page }) => {
  await page.goto("/settings");
  await page.getByLabel("Current password", { exact: true }).fill("secret");
  await page.getByLabel("New password", { exact: true }).fill("replacement");
  await page.getByRole("button", { name: "Change password", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Password changed" })).toBeVisible();
  await page.request.post("/api/logout");
  await page.reload();
  await expect(page.getByText(/Forgot your password/)).toBeVisible();
  await page.getByLabel("Username").fill("admin");
  await page.getByLabel("Password", { exact: true }).fill("replacement");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
});

for (const [name, path, route] of [["Bin", "/api/bin", "/?view=bin"], ["Recurring", "/api/recurring", "/?view=recurring"], ["Members", "/api/users", "/settings"], ["API tokens", "/api/tokens", "/settings"]]) {
  test(`${name} shows a failed load and retries`, async ({ app: page }) => {
    await page.route(`**${path}`, (r) => r.fulfill({ status: 400, json: { error: "Load failed" } }));
    await page.goto(route);
    await expect(page.getByRole("alert").filter({ hasText: "Load failed" })).toBeVisible();
    const retry = page.getByRole("button", { name: "Try again", exact: true });
    await expect(retry).toBeVisible();
    await page.unroute(`**${path}`);
    await retry.click({ timeout: 1000 }).catch(async (error) => {
      if (await retry.isVisible()) throw error;
    });
    await expect(page.getByRole("alert").filter({ hasText: "Load failed" })).toHaveCount(0);
  });
}

test("currency save reports failure, rolls back and can be retried", async ({ app: page }) => {
  await page.goto("/settings");
  await page.route("**/api/settings", async (route) => {
    if (route.request().method() !== "PUT") return route.continue();
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fulfill({ status: 400, json: { error: "Currency not saved" } });
  });
  await page.getByLabel("Base currency").selectOption("EUR");
  await expect(page.getByRole("status").filter({ hasText: "Saving settings" })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveText("Currency not saved");
  await expect(page.getByLabel("Base currency")).toHaveValue("GBP");
  await page.unroute("**/api/settings");
  await page.getByLabel("Base currency").selectOption("EUR");
  await expect(page.getByRole("status").filter({ hasText: "Settings saved" })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Base currency")).toHaveValue("EUR");
});

for (const [path, route, message] of [["/api/bin", "/?view=bin", "Loading bin"], ["/api/recurring", "/?view=recurring", "Loading recurring"], ["/api/users", "/settings", "Loading members"], ["/api/tokens", "/settings", "Loading tokens"]]) {
  test(`${message} appears before empty content`, async ({ app: page }) => {
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => { release = resolve; });
    await page.route(`**${path}`, async (r) => { await waiting; await r.continue(); });
    await page.goto(route);
    await expect(page.getByRole("status").filter({ hasText: message })).toBeVisible();
    release();
    await expect(page.getByRole("status").filter({ hasText: message })).toHaveCount(0);
    await page.unroute(`**${path}`);
  });
}
