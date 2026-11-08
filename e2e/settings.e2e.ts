import { bar, expect, test, today } from "./fixtures";

test("theme and base currency save as they change", async ({ app: page }) => {
  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("radio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("radio", { name: "Light" }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await Promise.all([page.waitForResponse((r) => !!r.request().postData()?.includes("EUR")), page.getByLabel("Base currency").selectOption("EUR")]);
  await page.reload();
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

test("a CSV previews and imports into an empty instance", async ({ app: page }) => {
  await page.getByRole("link", { name: "Settings" }).click();
  const csv = (rows: string[]) => ({ name: "expenses.csv", mimeType: "text/csv", buffer: Buffer.from(["date,note,amount,currency,category", ...rows].join("\n")) });

  await page.getByLabel("CSV file").setInputFiles(csv(["2025-03-01,Kibble,20.00,GBP,Pets", "2025-03-02,Bad,1,XYZ,"]));
  const preview = page.getByLabel("Import preview");
  await expect(preview).toContainText("Line 3: Invalid currency");
  await expect(preview.getByRole("button", { name: "Import 1" })).toBeDisabled();

  await page.getByLabel("CSV file").setInputFiles(csv(["2025-03-01,Kibble,20.00,GBP,Pets", "2025-03-02,Pizza,0.00012345,BTC,Food"]));
  await expect(preview).toContainText("2 expenses in expenses.csv");
  await expect(preview).toContainText("0.00012345 BTC · 20.00 GBP");
  await expect(preview).toContainText("New categories: Pets");
  await preview.getByRole("button", { name: "Import 2" }).click();
  await expect(page.getByText("Imported 2 expenses.")).toBeVisible();

  await page.goto("/?q=Kibble");
  await expect(page.getByText("Kibble").first()).toBeVisible();
});
