import { bar, expect, test } from "./fixtures";

test("first run creates the admin, picks currencies and lands on an empty month", async ({ fresh: page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Welcome" })).toBeVisible();
  await page.getByLabel("Username").fill("admin");
  await page.getByLabel("Password").fill("secret");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByRole("heading", { name: "Welcome" })).toBeVisible();
  await page.getByLabel("Base currency").selectOption("EUR");
  await page.getByLabel("Add a currency").selectOption("GBP");
  await expect(page.getByRole("button", { name: "Remove GBP" })).toBeVisible();
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
  await expect(page.getByText("wrong username or password")).toBeVisible();
  await page.getByLabel("Password").fill("secret");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
});
