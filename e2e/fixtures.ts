import { test as base, expect, type Page } from "@playwright/test";

export const test = base.extend<{ ai: boolean; fresh: Page; app: Page }>({
  ai: [false, { option: true }],
  fresh: async ({ page, ai }, use) => {
    const errors: string[] = [];
    // WebKit rejects fetches and imports cut off by a reload or navigation with these.
    page.on("pageerror", (e) => !/due to access control checks\.$|^Context is stopped$/.test(e.message) && errors.push(e.message));
    await page.request.post(ai ? "/__reset?ai" : "/__reset");
    await use(page);
    expect(errors).toEqual([]);
  },
  app: async ({ fresh: page }, use) => {
    await page.request.post("/api/setup", { data: { username: "admin", password: "secret" } });
    await page.request.post("/api/onboarding", { data: { baseCurrency: "GBP" } });
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
  Promise.all(rows.map((r) => page.request.post("/api/transactions", { data: { currency: "GBP", date: today(), tags: [], ...r } })));
