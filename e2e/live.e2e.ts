import { bar, expect, test } from "./fixtures";

test.use({ serviceWorkers: "block" });

test("another signed-in client sees writes and catches up after reconnecting", async ({ app: page, browser }) => {
  await expect(bar(page)).toBeVisible();
  const other = await browser.newContext();
  try {
    await other.request.post("/api/login", { data: { username: "admin", password: "secret" } });
    const second = await other.newPage();
    await second.goto("/");
    await expect(bar(second)).toBeVisible();
    await page.request.post("/api/transactions", { data: { note: "Shared lunch", amount: "12" } });
    await expect(second.getByRole("button", { name: "Shared lunch", exact: true })).toBeVisible();
    await other.setOffline(true);
    await page.request.post("/api/transactions", { data: { note: "Missed tea", amount: "2" } });
    await other.setOffline(false);
    await expect(second.getByRole("button", { name: "Missed tea", exact: true })).toBeVisible({ timeout: 40_000 });
    await other.request.post("/api/logout");
    await expect(second.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
    expect(await second.evaluate(() => localStorage.getItem("cache") ?? "")).not.toContain("Shared lunch");
  } finally {
    await other.close();
  }
});

for (const change of ["revocation", "account switch"]) test(`a delayed token response cannot restore private cache after ${change}`, async ({ app: page }) => {
  let release!: () => void;
  let received!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const ready = new Promise<void>((resolve) => { received = resolve; });
  if (change === "account switch") await page.request.post("/api/users", { data: { username: "partner", password: "secret" } });
  await page.goto("/settings");
  await page.route("**/api/tokens", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const response = await route.fetch();
    received();
    await held;
    await route.fulfill({ response });
  });
  await page.getByLabel("Token name").fill("Private held token");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await ready;
  await page.request.post("/api/logout");
  await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
  if (change === "account switch") {
    await page.getByLabel("Username").fill("partner");
    await page.getByLabel("Password", { exact: true }).fill("secret");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByLabel("Token name")).toBeVisible();
  }
  const finished = page.waitForEvent("requestfinished", { predicate: (r) => r.url().endsWith("/api/tokens") && r.method() === "POST" });
  release();
  await finished;
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(await page.evaluate(() => localStorage.getItem("cache") ?? "")).not.toContain("Private held token");
});
