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

test("members and API tokens", async ({ app: page }) => {
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
test("members export CSV but cannot back up or import", async ({ app: page }) => {
  await page.request.post("/api/users", { data: { username: "sam", password: "pw" } });
  await page.request.post("/api/login", { data: { username: "sam", password: "pw" } });
  await page.goto("/settings");
  await expect(page.getByRole("link", { name: "Export all as CSV" })).toHaveAttribute("href", "/api/export");
  await expect(page.getByRole("link", { name: "Download backup" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Import from CSV" })).toBeHidden();
});

test("browser chrome colour follows the chosen theme", async ({ app: page }) => {
  const color = () => page.locator("meta[name=theme-color]").getAttribute("content");
  await page.request.put("/api/settings", { data: { theme: "dark" } });
  await page.reload();
  await expect.poll(color).toBe("rgb(16, 28, 23)");
  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("radio", { name: "Light" }).click();
  await expect.poll(color).toBe("rgb(227, 232, 221)");
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

test("an admin connects an AI provider in Settings and AI turns on without a restart", async ({ app: page }) => {
  await expect(bar(page)).toHaveAccessibleName("Add an expense");
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Models" })).toBeHidden();
  await page.getByLabel("Base URL").fill("https://ai.test/v1/");
  await page.getByLabel("API key", { exact: true }).fill("sk-wrong");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("The AI provider refused the key (401)");
  await page.getByLabel("API key", { exact: true }).fill("sk-e2e-key-0000");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved key ends in 0000.")).toBeVisible();
  await expect(page.getByLabel("API key", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Base URL")).toHaveValue("https://ai.test/v1");
  await expect(page.getByLabel("Chat", { exact: true })).toHaveValue("gpt-4o-mini");
  await page.getByRole("link", { name: "Expenses" }).click();
  await expect(bar(page)).toHaveAccessibleName("Add an expense, or start with ? to ask");
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByText("Asking and receipts", { exact: true }).locator("..")).toContainText("API key");
});

test.describe("with several AI models", () => {
  test.use({ ai: ["gpt-4o", "gpt-4o-mini", "whisper-1", "gpt-4o-transcribe"] });

  test("an admin picks models in Settings and AI turns on without a restart", async ({ app: page }) => {
    await expect(bar(page)).toHaveAccessibleName("Add an expense");
    await page.getByRole("link", { name: "Settings" }).click();
    await expect(page.getByText("Choose a chat model to turn on asking")).toBeVisible();
    await page.getByLabel("Chat", { exact: true }).selectOption("gpt-4o-mini");
    await expect(page.getByLabel("Receipt photos")).toHaveValue("gpt-4o-mini");
    await expect(page.getByText("Choose a dictation model")).toBeVisible();
    await page.getByLabel("Dictation", { exact: true }).selectOption("gpt-4o-transcribe");
    await expect(page.getByText("Models come from the API key above.")).toBeVisible();
    await page.getByRole("link", { name: "Expenses" }).click();
    await expect(bar(page)).toHaveAccessibleName("Add an expense, or start with ? to ask");
  });

  test("members don't see the AI models", async ({ app: page }) => {
    await page.request.post("/api/users", { data: { username: "sam", password: "pw" } });
    await page.request.post("/api/login", { data: { username: "sam", password: "pw" } });
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Members" })).toBeHidden();
    await expect(page.getByRole("heading", { name: "Models" })).toBeHidden();
    await expect(page.getByRole("heading", { name: "API key" })).toBeHidden();
    await expect(page.getByText("AI isn’t finished setting up. Ask an admin to choose a chat model.")).toBeVisible();
  });

  test("clearing the base URL turns AI off", async ({ app: page }) => {
    await page.getByRole("link", { name: "Settings" }).click();
    await expect(page.getByText("Saved key ends in 0000.")).toBeVisible();
    await page.getByLabel("Base URL").fill("");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Saved key ends in 0000.")).toBeHidden();
    await expect(page.getByRole("heading", { name: "Models" })).toBeHidden();
  });
});

test("ChatGPT manual connection shows the sign-in link and recovers from a bad callback", async ({ app: page }, testInfo) => {
  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Connect ChatGPT", exact: true }).click();
  const link = page.getByRole("link", { name: "Sign in to ChatGPT" });
  await expect(link).toHaveAttribute("href", /^https:\/\/auth.openai.com\/api\/accounts\/authorize\?/);
  await page.reload();
  await expect(link).toBeVisible();
  const address = page.getByLabel("Address of the error page");
  await address.fill("https://example.com/");
  await page.getByRole("button", { name: "Finish connecting" }).click();
  await expect(page.getByRole("alert")).toContainText("That isn’t the address of the page that failed to load.");
  await address.fill("http://127.0.0.1:1455/auth/callback?state=bad&code=bad");
  await page.getByRole("button", { name: "Finish connecting" }).click();
  await expect(page.getByRole("alert")).toHaveText("This sign-in attempt has expired. Select Connect ChatGPT to start again.");
  await page.getByRole("heading", { name: "ChatGPT plan" }).scrollIntoViewIfNeeded();
  await page.getByRole("heading", { name: "ChatGPT plan" }).locator("..").screenshot({ path: testInfo.outputPath("chatgpt-settings.png") });
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Connect ChatGPT", exact: true })).toBeVisible();
});
