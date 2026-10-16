import { test as base, expect, type Page } from "@playwright/test";

export const test = base.extend<{ ai: boolean; fresh: Page; app: Page }>({
  ai: [false, { option: true }],
  fresh: async ({ page, ai }, use) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => !e.message.endsWith("due to access control checks.") && errors.push(e.message));
    await page.request.post(ai ? "/__reset?ai" : "/__reset");
    await use(page);
    expect(errors).toEqual([]);
  },
  app: async ({ fresh: page }, use) => {
    await page.request.post("/api/setup", { data: { username: "admin", password: "secret" } });
    await page.request.post("/api/onboarding", { data: { baseCurrency: "GBP", currencies: ["EUR", "BTC"] } });
    await page.goto("/");
    await use(page);
  },
});

export { expect };

export const bar = (page: Page) => page.getByRole("textbox", { name: /Add an expense|Ask about/ });

export async function add(page: Page, line: string) {
  await bar(page).fill(line);
  await bar(page).press("Enter");
  await expect(bar(page)).toHaveValue("");
}

export const today = () => new Date().toLocaleDateString("en-CA");

export const seed = (page: Page, rows: { note: string; amount: string; currency?: string; date?: string; categoryId?: number; tags?: string[] }[]) =>
  Promise.all(rows.map((r) => page.request.post("/api/expenses", { data: { currency: "GBP", date: today(), tags: [], ...r } })));
