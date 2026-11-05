import { add, bar, expect, test } from "./fixtures";

test.use({ serviceWorkers: "block" });

test("failed offline entries survive reload and can be corrected and retried", async ({ app: page, context }) => {
  await expect(bar(page)).toBeVisible();
  await context.setOffline(true);
  await add(page, "bus 2.80");
  await page.route("**/api/expenses", (route) => route.request().method() === "POST" ? route.fulfill({ status: 400, json: { error: "Check the note" } }) : route.continue());
  await context.setOffline(false);
  const outbox = page.getByRole("region", { name: "Unsent changes" });
  await expect(outbox).toContainText("Check the note");
  await page.reload();
  await expect(outbox).toContainText("bus");
  await outbox.getByRole("button", { name: "Edit" }).click();
  await outbox.getByLabel("Note").fill("bus fare");
  await outbox.getByRole("button", { name: "Keep changes" }).click();
  await page.unroute("**/api/expenses");
  await outbox.getByRole("button", { name: "Retry" }).click();
  await expect(outbox).toBeHidden();
  await expect(page.getByRole("button", { name: "bus fare", exact: true })).toBeVisible();
});

test("storage failure never promises that an offline expense is saved", async ({ app: page, context }) => {
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException("Full", "QuotaExceededError"); }; });
  await expect(bar(page)).toBeVisible();
  await context.setOffline(true);
  await bar(page).fill("tea 2");
  await bar(page).press("Enter");
  await expect(page.getByRole("alert").filter({ hasText: "Keep this tab open" })).toBeVisible();
  await expect(page.getByText("Offline. Saved here, will sync.")).toBeHidden();
});

test("offline sign-out confirms unsent changes and clears cached data", async ({ app: page, context }) => {
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Expenses", exact: true }).click();
  await expect(bar(page)).toBeVisible();
  await context.setOffline(true);
  await add(page, "private 2");
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByText(/Unsent changes will be removed/)).toBeVisible();
  await page.getByRole("button", { name: "Remove changes and sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("cache") ?? "")).not.toContain("private");
  await context.setOffline(false);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
  await expect.poll(async () => (await page.request.get("/api/expenses")).status()).toBe(401);
});

test("discarding a paused entry never posts it after reconnecting", async ({ app: page, context }) => {
  await expect(bar(page)).toBeVisible();
  await context.setOffline(true);
  await add(page, "discard me 2");
  await page.getByRole("region", { name: "Unsent changes" }).getByRole("button", { name: "Discard" }).click();
  await context.setOffline(false);
  await expect(page.getByRole("region", { name: "Unsent changes" })).toBeHidden();
  await add(page, "keep me 3");
  expect((await (await page.request.get("/api/expenses")).json()).map((r: { note: string }) => r.note)).toEqual(["keep me"]);
});

test("expired-session entries cannot replay as another household member", async ({ app: page, context }) => {
  await page.request.post("/api/users", { data: { username: "partner", password: "secret" } });
  await expect(bar(page)).toBeVisible();
  await context.setOffline(true);
  await add(page, "original user 2");
  await page.request.post("/api/login", { data: { username: "partner", password: "secret" } });
  await context.setOffline(false);
  await expect(page.getByRole("region", { name: "Unsent changes" })).toBeHidden();
  await page.request.post("/api/logout");
  await page.reload();
  await page.getByLabel("Username").fill("partner");
  await page.getByLabel("Password", { exact: true }).fill("secret");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Unsent changes belong to admin");
  await page.getByLabel("Username").fill("admin");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const outbox = page.getByRole("region", { name: "Unsent changes" });
  await expect(outbox).toContainText("original user");
  await outbox.getByRole("button", { name: "Retry" }).click();
  await expect(outbox).toBeHidden();
  const rows = await (await page.request.get("/api/expenses")).json();
  expect(rows.map((r: { note: string; addedBy: string }) => [r.note, r.addedBy])).toEqual([["original user", "admin"]]);
});

test("reload during offline replay keeps the entry and retry never duplicates it", async ({ app: page, context }) => {
  await expect(bar(page)).toBeVisible();
  await context.setOffline(true);
  await add(page, "interrupted 4");
  let accepted!: () => void;
  let release!: () => void;
  const saved = new Promise<void>((resolve) => { accepted = resolve; });
  const waiting = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/expenses", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const response = await route.fetch();
    accepted();
    await waiting;
    await route.fulfill({ response }).catch(() => {});
  });
  await context.setOffline(false);
  await saved;
  await page.reload();
  const outbox = page.getByRole("region", { name: "Unsent changes" });
  await expect(outbox).toContainText("interrupted");
  await expect(outbox.getByRole("button", { name: "Retry" })).toBeEnabled();
  release();
  await page.unroute("**/api/expenses");
  await outbox.getByRole("button", { name: "Retry" }).click();
  await expect(outbox).toBeHidden();
  expect((await (await page.request.get("/api/expenses")).json()).length).toBe(1);
});

test("password changes are never persisted while offline", async ({ app: page, context }) => {
  await page.goto("/settings");
  await page.getByLabel("Current password", { exact: true }).fill("secret");
  await page.getByLabel("New password", { exact: true }).fill("never-store-me");
  await context.setOffline(true);
  await page.getByRole("button", { name: "Change password", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Couldn’t reach the server" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("cache") ?? "")).not.toContain("never-store-me");
});

test("retrying an old change preserves a new unfinished quick entry", async ({ app: page, context }) => {
  await expect(bar(page)).toBeVisible();
  await context.setOffline(true);
  await add(page, "old entry 2");
  await page.route("**/api/expenses", (r) => r.request().method() === "POST" ? r.fulfill({ status: 400, json: { error: "Try later" } }) : r.continue());
  await context.setOffline(false);
  const outbox = page.getByRole("region", { name: "Unsent changes" });
  await expect(outbox).toContainText("Try later");
  await bar(page).fill("new unfinished entry 3");
  await page.unroute("**/api/expenses");
  await outbox.getByRole("button", { name: "Retry" }).click();
  await expect(outbox).toBeHidden();
  await expect(bar(page)).toHaveValue("new unfinished entry 3");
});

test("editing cannot replace an entry while its replay is in flight", async ({ app: page, context }) => {
  await expect(bar(page)).toBeVisible();
  await context.setOffline(true);
  await add(page, "original replay 2");
  const outbox = page.getByRole("region", { name: "Unsent changes" });
  await outbox.getByRole("button", { name: "Edit" }).click();
  await outbox.getByLabel("Note").fill("edited replay");
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/expenses", async (route) => {
    if (route.request().method() === "POST") await waiting;
    await route.continue();
  });
  await context.setOffline(false);
  await expect(outbox).toContainText("Syncing");
  await expect(outbox.getByRole("button", { name: "Keep changes" })).toBeDisabled();
  release();
  await expect(outbox).toBeHidden();
  expect((await (await page.request.get("/api/expenses")).json()).length).toBe(1);
});

test("reopening online automatically syncs an offline entry", async ({ app: page, context }) => {
  await expect(bar(page)).toBeVisible();
  await context.setOffline(true);
  await add(page, "reopen online 2");
  await page.close();
  await context.setOffline(false);
  const reopened = await context.newPage();
  await reopened.goto("/");
  await expect(reopened.getByRole("button", { name: "reopen online", exact: true })).toBeVisible();
  await expect(reopened.getByRole("region", { name: "Unsent changes" })).toBeHidden();
});

test("legacy queued creations receive a stable ID before their first replay", async ({ app: page, context }) => {
  await expect(bar(page)).toBeVisible();
  await context.setOffline(true);
  await add(page, "legacy queued 2");
  await page.evaluate(() => {
    const cache = JSON.parse(localStorage.getItem("cache")!);
    for (const mutation of cache.mutations) {
      delete mutation.state.variables[2].requestId;
      delete mutation.meta;
      delete mutation.state.context;
    }
    localStorage.setItem("cache", JSON.stringify(cache));
  });
  await page.close();
  await context.setOffline(false);
  const reopened = await context.newPage();
  let accepted!: () => void;
  let release!: () => void;
  const saved = new Promise<void>((resolve) => { accepted = resolve; });
  const waiting = new Promise<void>((resolve) => { release = resolve; });
  await reopened.route("**/api/expenses", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const response = await route.fetch();
    accepted();
    await waiting;
    await route.fulfill({ response }).catch(() => {});
  });
  await reopened.goto("/");
  await Promise.race([saved, new Promise((_, reject) => setTimeout(() => reject(new Error("Legacy entry did not replay")), 5000))]);
  const stored = await reopened.evaluate(() => JSON.parse(localStorage.getItem("cache")!).mutations[0].state.variables[2].requestId);
  expect(stored).toMatch(/^[0-9a-f-]{36}$/);
  await reopened.reload();
  release();
  await reopened.unroute("**/api/expenses");
  const outbox = reopened.getByRole("region", { name: "Unsent changes" });
  await outbox.getByRole("button", { name: "Retry" }).click();
  await expect(outbox).toBeHidden();
  expect((await (await reopened.request.get("/api/expenses")).json()).length).toBe(1);
});

for (const updateFails of [false, true])
test(`editing an accepted creation with a lost response applies the correction once${updateFails ? " after a failed update" : ""}`, async ({ app: page, context }) => {
  await expect(bar(page)).toBeVisible();
  await context.setOffline(true);
  await add(page, "original accepted 2");
  await page.route("**/api/expenses", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fetch();
    await route.abort();
  });
  await context.setOffline(false);
  const outbox = page.getByRole("region", { name: "Unsent changes" });
  await expect(outbox).toContainText("Couldn’t reach the server");
  await outbox.getByRole("button", { name: "Edit" }).click();
  await outbox.getByLabel("Note").fill("corrected accepted");
  await outbox.getByLabel("Amount").fill("3.50");
  await outbox.getByRole("button", { name: "Keep changes" }).click();
  await page.reload();
  await expect(outbox).toContainText("corrected accepted");
  await page.unroute("**/api/expenses");
  if (updateFails) await page.route("**/api/expenses/*", (route) => route.fulfill({ status: 400, json: { error: "Correction not saved" } }));
  await outbox.getByRole("button", { name: "Retry" }).click();
  if (updateFails) {
    await expect(outbox).toContainText("Correction not saved");
    await page.reload();
    await expect(outbox).toContainText("corrected accepted");
    await page.unroute("**/api/expenses/*");
    await outbox.getByRole("button", { name: "Retry" }).click();
  }
  await expect(outbox).toBeHidden();
  const rows = await (await page.request.get("/api/expenses")).json();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ note: "corrected accepted", amount: 350 });
});
