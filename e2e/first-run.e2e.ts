import { bar, expect, test } from "./fixtures";

test("first run creates the admin, picks a base currency and lands on an empty month", async ({ fresh: page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Welcome" })).toBeVisible();
  await page.getByLabel("Username").fill("admin");
  await page.getByLabel("Password").fill("secret");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByRole("heading", { name: "Welcome" })).toBeVisible();
  await page.getByLabel("Base currency").selectOption("EUR");
  await page.getByRole("button", { name: "Start" }).click();

  await expect(page.getByText("Nothing this month yet")).toBeVisible();
  await expect(bar(page)).toBeFocused();
  await expect(page.getByText("Start with the last thing you paid for")).toBeVisible();
});

test("sign out and back in", async ({ app: page }) => {
  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.getByLabel("Username").fill("admin");
  await page.getByLabel("Password").fill("wrong");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Wrong username or password")).toBeVisible();
  await page.getByLabel("Password").fill("secret");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
});

test.describe(() => {
  test.use({ serviceWorkers: "block" });

  test("an unreachable server says so and can be retried", async ({ fresh: page }) => {
    test.setTimeout(60_000);
    await page.route("**/api/session", (route) => route.abort());
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Can’t load Expenses" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Couldn’t reach the server.")).toBeVisible();
    await page.unroute("**/api/session");
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("heading", { name: "Welcome" })).toBeVisible();
  });
});
