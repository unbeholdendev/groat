import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

test.use({ ai: true });

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
  await expect(page.getByText("No chats yet. Ask about your spending in the bar below.", { exact: false })).toBeVisible();
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
