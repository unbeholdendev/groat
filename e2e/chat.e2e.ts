import type { Page } from "@playwright/test";
import { bar, expect, test } from "./fixtures";

test.use({ ai: true, serviceWorkers: "block" });

const nav = (page: Page) => page.getByRole("navigation", { name: "Main" });

test("saved chats update across tabs without refreshing the ledger", async ({ app: page, context }) => {
  const second = await context.newPage();
  await second.goto("/chat");
  await expect(second.getByRole("heading", { name: "Chats", exact: true })).toBeVisible();
  const created = await page.request.post("/api/chats", { data: { message: "Shared question" } });
  const chat = await created.json();
  await second.getByRole("button", { name: "Shared question", exact: true }).click();
  await expect(second.getByRole("heading", { name: "Shared question", exact: true })).toBeVisible();
  const ledgerRequests: string[] = [];
  second.on("request", (request) => {
    if (request.method() === "GET" && request.url().includes("/api/transactions?")) ledgerRequests.push(request.url());
  });
  await page.request.post(`/api/chats/${chat.id}/messages`, { data: { message: "Follow-up question" } });
  await expect(second.getByText("Follow-up question", { exact: true })).toBeVisible();
  await page.request.delete(`/api/chats/${chat.id}`);
  await expect(second.getByRole("heading", { name: "Chat not found", exact: true })).toBeVisible();
  expect(ledgerRequests).toEqual([]);
});

const openChats = async (page: Page, isMobile: boolean) => {
  if (isMobile) await page.getByRole("link", { name: "Chats" }).click();
  else await nav(page).getByRole("link", { name: "Chats" }).click();
  await expect(page.getByRole("heading", { name: "Chats" })).toBeVisible();
};

test("desktop nav has Chats, current on /chat", async ({ app: page, isMobile }) => {
  test.skip(isMobile, "desktop nav");
  await openChats(page, isMobile);
  await expect(nav(page).getByRole("link", { name: "Chats" })).toHaveAttribute("aria-current", "page");
  await expect(nav(page).getByRole("link", { name: "Settings" })).not.toHaveAttribute("aria-current");
  await expect(
    page.getByText("No chats yet. Ask about your spending in the bar below.", { exact: false }),
  ).toBeVisible();
});

test("phone reaches chats from Home, with no tab current", async ({ app: page, isMobile }) => {
  test.skip(!isMobile, "phone entry point");
  await openChats(page, isMobile);
  await expect(page).toHaveURL(/\/chat$/);
  await expect(nav(page).locator("[aria-current]:visible")).toHaveCount(0);
});

test("back leaves an open chat for the list, then goes Home", async ({ app: page, isMobile }) => {
  await page.request.post("/api/chats", { data: { message: "Saved question" } });
  await openChats(page, isMobile);
  await page.getByRole("button", { name: "Saved question" }).click();
  await expect(page).toHaveURL(/\/chat\?id=\d+$/);
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Chats" })).toBeVisible();
  await page.getByRole("button", { name: "Saved question" }).click();
  await expect(page.getByRole("heading", { name: "Saved question" })).toBeVisible();
  await page.getByRole("button", { name: "Chats" }).click();
  await expect(page).toHaveURL(/\/chat$/);
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("a chat opened by link goes back to the list, then Home", async ({ app: page }) => {
  const chat = await (await page.request.post("/api/chats", { data: { message: "Saved question" } })).json();
  await page.goto(`/chat?id=${chat.id}`);
  await page.getByRole("button", { name: "Chats" }).click();
  await expect(page.getByRole("button", { name: "Saved question" })).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("an unknown chat says so and leads back to the list", async ({ app: page }) => {
  await page.goto("/chat?id=999");
  await expect(page.getByRole("heading", { name: "Chat not found" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);
  await page.getByRole("button", { name: "Chats" }).click();
  await expect(page.getByRole("heading", { name: "Chats" })).toBeVisible();
});

test("a long unbroken reply wraps instead of scrolling sideways", async ({ app: page }) => {
  const created = await page.request.post("/api/chats", { data: { message: "Show raw results" } });
  await page.goto(`/chat?id=${(await created.json()).id}`);
  const reply = page.getByText('{"id":', { exact: false });
  await expect(reply).toBeVisible();
  expect(await page.locator("main").evaluate((main) => main.scrollWidth - main.clientWidth)).toBe(0);
});

const slow = async (page: Page) => {
  const chat = await (await page.request.post("/api/chats", { data: { message: "Add two slow coffees" } })).json();
  await page.goto(`/chat?id=${chat.id}`);
  await expect(page.getByText("Add transaction ✓")).toBeVisible();
  await expect(page.getByText("Working on it…")).toBeVisible();
};
const notes = async (page: Page) =>
  (await (await page.request.get("/api/transactions")).json()).map((t: { note: string }) => t.note);

test("each step of a run shows before the final reply", async ({ app: page }) => {
  await slow(page);
  await expect(page.getByText("Added both slow coffees.")).toBeHidden();
  await page.request.post("/__release");
  await expect(page.getByText("Added both slow coffees.")).toBeVisible();
  await expect(page.getByText("Add transaction ✓")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Stop" })).toBeHidden();
});

test("stopping a run keeps its steps and runs no further action", async ({ app: page }) => {
  await slow(page);
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByText("Stopped.", { exact: true })).toBeVisible();
  await expect(page.getByText("Add transaction ✓")).toHaveCount(1);
  await page.request.post("/__release");
  await expect(page.getByRole("button", { name: "Stop" })).toBeHidden();
  expect(await notes(page)).toEqual(["Slow coffee"]);
});

test("a run carries on through a reload", async ({ app: page }) => {
  await slow(page);
  await page.reload();
  await expect(page.getByText("Add transaction ✓")).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  await page.request.post("/__release");
  await expect(page.getByText("Added both slow coffees.")).toBeVisible();
  expect((await notes(page)).sort()).toEqual(["Second slow coffee", "Slow coffee"]);
});

test("a reply that finishes before the question's response arrives stays shown", async ({ app: page }) => {
  const chat = await (await page.request.post("/api/chats", { data: { message: "First question" } })).json();
  await page.goto(`/chat?id=${chat.id}`);
  await expect(page.getByText("Mostly on food.")).toHaveCount(1);
  await page.route(`**/api/chats/${chat.id}/messages`, async (route) => {
    const response = await route.fetch();
    await expect.poll(async () => (await (await page.request.get(`/api/chats/${chat.id}`)).json()).running).toBe(false);
    await expect(page.getByText("Mostly on food.")).toHaveCount(2);
    await route.fulfill({ response });
  });
  const answered = page.waitForResponse(`**/api/chats/${chat.id}/messages`);
  await bar(page).fill("Second question");
  await bar(page).press("Enter");
  await expect(bar(page)).toHaveValue("");
  await answered;
  await expect(page.getByText("Mostly on food.")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Stop" })).toBeHidden();
});

for (const available of [true, false]) {
  test(`saved chats open before AI availability resolves (${available ? "available" : "unavailable"})`, async ({
    fresh: page,
    isMobile,
  }) => {
    await page.request.post("/api/setup", { data: { username: "admin", password: "secret" } });
    await page.request.post("/api/onboarding", { data: { baseCurrency: "GBP" } });
    const created = await page.request.post("/api/chats", { data: { message: "Saved question" } });
    expect(created.status()).toBe(202);
    const { id } = await created.json();
    await expect.poll(async () => (await (await page.request.get(`/api/chats/${id}`)).json()).running).toBe(false);
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/ai/status", async (route) => {
      await pending;
      await route.fulfill({
        json: { ai: available, aiSource: available ? "key" : null, aiProblem: null, vision: available, voice: false },
      });
    });
    try {
      await page.goto("/");
      await openChats(page, isMobile);
      await page.getByRole("button", { name: "Saved question", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Saved question", exact: true })).toBeVisible();
      await expect(page.getByText("Mostly on food.")).toBeVisible();
      const checked = page.waitForResponse("**/api/ai/status");
      release();
      await checked;
      await page.getByRole("button", { name: "Chats", exact: true }).click();
      await page.getByRole("button", { name: "Back", exact: true }).click();
      await expect(page.getByRole("link", { name: "Chats", exact: true }).filter({ visible: true })).toBeVisible();
    } finally {
      release();
    }
  });
}
