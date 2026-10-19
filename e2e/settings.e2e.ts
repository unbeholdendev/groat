import { bar, expect, test, today } from "./fixtures";

test("theme and currencies save as they change", async ({ app: page }) => {
  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("radio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("radio", { name: "Light" }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await Promise.all([page.waitForResponse((r) => !!r.request().postData()?.includes("JPY")), page.getByLabel("Add a currency").selectOption("JPY")]);
  await page.getByLabel("Base currency").selectOption("EUR");
  await expect(page.getByRole("button", { name: "Remove GBP" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Remove JPY" })).toBeVisible();
  await expect(page.getByLabel("Base currency")).toHaveValue("EUR");
  await expect(page.locator("html")).not.toHaveClass(/dark/);
});

test("recurring expenses are created, listed, paused and stopped", async ({ app: page }) => {
  await page.getByRole("button", { name: "Full form" }).click();
  await page.getByLabel("Note").fill("Gym");
  await page.getByLabel("Amount").fill("30");
  await page.getByLabel("Repeat").selectOption("month");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("button", { name: "Gym" })).toBeVisible();

  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("link", { name: "Recurring" }).click();
  await expect(page.getByText("£30.00 every month")).toBeVisible();
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByText("· paused")).toBeVisible();
  await page.getByRole("button", { name: "Stop" }).click();
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByText("Nothing repeats yet.")).toBeVisible();
});

test("pending recurring expenses confirm from Home", async ({ app: page }) => {
  await page.request.post("/api/recurring", { data: { note: "Rent", amount: "900", currency: "GBP", period: "month", every: 1, startDate: today(), needsConfirmation: true } });
  await page.reload();
  await expect(page.getByText(/due today/)).toBeVisible();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByRole("button", { name: "Rent" })).toBeVisible();
  await expect(page.locator("header").getByText("£900.00").first()).toBeVisible();
});

test("household members and API tokens", async ({ app: page }) => {
  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Add member" }).click();
  await page.getByPlaceholder("Username").fill("sam");
  await page.getByPlaceholder("Password").fill("pw");
  await page.getByRole("button", { name: "Add member" }).click();
  await expect(page.getByText("sam", { exact: true })).toBeVisible();

  await page.getByLabel("Token name").fill("iPhone");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText("Copy it now.")).toBeVisible();
  const token = await page.locator("code").textContent();
  await expect(page.locator("pre")).toContainText(`Bearer ${token}`);
  const res = await page.request.post("/api/capture", { headers: { authorization: `Bearer ${token}` }, data: { text: "milk 1.20" } });
  expect(res.ok()).toBe(true);
  await page.getByRole("link", { name: "Expenses" }).click();
  await expect(bar(page)).toBeVisible();
  await expect(page.getByText("milk")).toBeVisible();
});
test("browser chrome colour follows the chosen theme", async ({ app: page }) => {
  const color = () => page.locator("meta[name=theme-color]").getAttribute("content");
  await page.request.put("/api/settings", { data: { theme: "dark" } });
  await page.reload();
  await expect.poll(color).toBe("rgb(13, 15, 21)");
  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("radio", { name: "Light" }).click();
  await expect.poll(color).toBe("rgb(245, 247, 251)");
});
