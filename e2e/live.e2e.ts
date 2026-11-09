import { add, bar, expect, test } from "./fixtures";

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

test("a tab's own write reaches its other tabs but is not echoed back to it", async ({ app: page, context }) => {
  const frames: string[] = [];
  page.on("websocket", (ws) => ws.on("framereceived", (f) => frames.push(String(f.payload))));
  await page.reload();
  await expect(bar(page)).toBeVisible();
  await expect.poll(() => frames.some((f) => f.includes('"ready"'))).toBe(true);
  const second = await context.newPage();
  await second.goto("/");
  await expect(bar(second)).toBeVisible();
  const refetched: string[] = [];
  page.on("request", (r) => r.method() === "GET" && r.url().includes("/api/transactions?") && refetched.push(r.url()));
  await add(page, "echo tea 2");
  await expect(page.getByRole("button", { name: "echo tea", exact: true })).toBeVisible();
  await expect(second.getByRole("button", { name: "echo tea", exact: true })).toBeVisible();
  expect(refetched).toEqual([]);
  await second.request.post("/api/transactions", { data: { note: "Other tab", amount: "1" } });
  await expect(page.getByRole("button", { name: "Other tab", exact: true })).toBeVisible();
  expect(frames.filter((f) => f.includes('"changed"'))).toEqual(['{"type":"changed","resources":["transactions"]}']);
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
