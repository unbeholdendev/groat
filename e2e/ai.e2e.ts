import { bar, expect, test } from "./fixtures";

test.use({ ai: true, serviceWorkers: "block" });

test("a note and amount save without a category or AI review", async ({ app: page }) => {
  const drafts: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/drafts")) drafts.push(request.url());
  });
  await bar(page).fill("corner shop 12.50");
  await bar(page).press("Enter");
  await expect(bar(page)).toHaveValue("");
  await expect(page.getByRole("region", { name: "Review expense" })).toBeHidden();
  await expect(page.getByRole("listitem").filter({ hasText: "corner shop" })).toContainText("£12.50");
  await expect(page.getByRole("listitem").filter({ hasText: "corner shop" })).toContainText("Uncategorised");
  const rows = await (await page.request.get("/api/transactions")).json();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ note: "corner shop" });
  expect(drafts).toEqual([]);
});

test("a new line goes to AI and saves from the review card", async ({ app: page }) => {
  await bar(page).fill("corner shop");
  await expect(page.getByText("Press Enter to create an expense draft for review.")).toBeVisible();
  await bar(page).press("Enter");
  const card = page.getByRole("region", { name: "Review expense" });
  await expect(card.getByLabel("Amount")).toHaveValue("9.99");
  await expect(card.getByRole("button", { name: "Save" })).toBeInViewport({ ratio: 1 });
  await card.getByLabel("Note").fill("Corner shop");
  await card.getByRole("button", { name: "Save" }).click();
  await expect(card).toBeHidden();
  await expect(page.getByRole("listitem").filter({ hasText: "Corner shop" })).toContainText("£9.99");
});

test("? asks, and the answer continues in chat", async ({ app: page }) => {
  await bar(page).fill("?where does it go");
  await bar(page).press("Enter");
  await expect(page.getByText("Mostly on food.")).toBeVisible();
  await expect(bar(page)).toHaveValue("");
  await page.getByRole("button", { name: "Continue in chat" }).click();
  await expect(page.getByRole("heading", { name: "where does it go" })).toBeVisible();
  await bar(page).fill("and last month?");
  await bar(page).press("Enter");
  await expect(page.getByText("Mostly on food.")).toHaveCount(2);
  await expect(bar(page)).toHaveValue("");
  await page.getByRole("button", { name: "Chats" }).click();
  await expect(page.getByRole("button", { name: "where does it go" })).toBeVisible();
});

test("past chats remain readable after the AI provider is removed", async ({ app: page, isMobile }) => {
  const response = await page.request.post("/api/chats", { data: { message: "Saved question" } });
  expect(response.status()).toBe(201);
  expect((await page.request.put("/api/ai", { data: { baseUrl: "" } })).ok()).toBe(true);
  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("link", { name: isMobile ? "Past chats" : "Chats", exact: true }).click();
  await page.getByRole("button", { name: "Saved question" }).click();
  await expect(page.getByRole("heading", { name: "Saved question" })).toBeVisible();
  await expect(page.getByText("Mostly on food.")).toBeVisible();
});

test("an explicit chat request saves the expense and refreshes Home without manual saving", async ({ app: page }) => {
  await bar(page).fill("?Add test coffee for £3");
  await bar(page).press("Enter");
  await expect(page.getByText("Added test coffee.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("button", { name: "Test coffee", exact: true })).toBeVisible();
  const rows = await (await page.request.get("/api/transactions")).json();
  expect(rows.filter((r: { note: string }) => r.note === "Test coffee")).toHaveLength(1);
});

test("a delayed chat reply cannot repopulate the device cache after revocation", async ({ app: page }) => {
  let release!: () => void;
  let received!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const ready = new Promise<void>((resolve) => { received = resolve; });
  await page.route("**/api/chats", async (route) => {
    const response = await route.fetch();
    received();
    await held;
    await route.fulfill({ response });
  });
  await bar(page).fill("?Private delayed question");
  await bar(page).press("Enter");
  await ready;
  await page.request.post("/api/logout");
  await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
  const finished = page.waitForEvent("requestfinished", { predicate: (r) => r.url().endsWith("/api/chats") && r.method() === "POST" });
  release();
  await finished;
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(await page.evaluate(() => localStorage.getItem("cache") ?? "")).not.toContain("Private delayed question");
});

test("chat requests fail offline instead of queuing actions for later", async ({ app: page, context }) => {
  await expect(bar(page)).toBeVisible();
  await context.setOffline(true);
  await bar(page).fill("?Add test coffee for £3");
  await bar(page).press("Enter");
  await expect(page.getByText("Couldn’t reach the server. Check your connection and try again.", { exact: true })).toBeVisible();
  await expect(bar(page)).toHaveValue("?Add test coffee for £3");
  const cache = await page.evaluate(() => JSON.parse(localStorage.getItem("cache") ?? "{}"));
  expect(cache.mutations ?? []).toHaveLength(0);
});

test("expense entry works while AI availability is pending", async ({ fresh: page }) => {
  await page.request.post("/api/setup", { data: { username: "admin", password: "secret" } });
  await page.request.post("/api/onboarding", { data: { baseCurrency: "GBP" } });
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/ai/status", async (route) => {
    await pending;
    await route.continue();
  });
  try {
    await page.goto("/");
    await bar(page).fill("Coffee 3");
    await bar(page).press("Enter");
    await expect(page.getByRole("listitem").filter({ hasText: "Coffee" })).toContainText("£3.00");
    await page.getByRole("link", { name: "Settings", exact: true }).click();
    await expect(page.getByText("Checking AI availability…")).toBeVisible();
    release();
    await expect(page.getByText("Checking AI availability…")).toBeHidden();
    await expect(page.getByText("Everyone on this server uses it", { exact: false })).toBeVisible();
  } finally {
    release();
  }
});
