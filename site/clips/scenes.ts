import { type APIRequestContext, expect, type Locator, type Page } from "@playwright/test";
import type { Band, Scene } from "./record";

const bar = (page: Page) => page.getByRole("textbox", { name: /Add an expense|Ask about/ });
const composer = (page: Page) => page.locator("form").filter({ has: bar(page) });
const gap = 20;
const top = async (l: Locator) => (await edge(l, "top")) - gap;
const edges = (l: Locator) => l.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().bottom));
const fit = async (page: Page, from: number, bottoms: number[], max: number): Promise<Band> => {
  const dock = page.getByRole("navigation", { name: "Main" }).locator("..");
  const floor = (await dock.isVisible()) ? await dock.evaluate((e) => e.getBoundingClientRect().top) : Infinity;
  const bottom = Math.max(...bottoms.filter((b) => b > from + 100 && b <= Math.min(from + max, floor)));
  if (!Number.isFinite(bottom)) throw new Error(`nothing ends within ${max} px of ${from}`);
  return { top: from, bottom };
};
const ledger = async (page: Page) =>
  fit(page, await top(composer(page)), await edges(page.locator("section[id^=day-]")), 560);
const edge = (l: Locator, side: "top" | "bottom") => l.evaluate((e, side) => e.getBoundingClientRect()[side], side);
const place = (l: Locator, y: number, behavior: ScrollBehavior) =>
  l.evaluate(
    (e, { y, behavior }) => {
      e.style.scrollMarginTop = `${y}px`;
      e.scrollIntoView({ block: "start", behavior });
    },
    { y, behavior },
  );
const sent = (page: Page) => page.getByText("make spotify recurring", { exact: true });
const type = async (page: Page, text: string) => {
  await bar(page).click();
  await page.keyboard.type(text, { delay: 85 });
};

const receipt = `<meta name="viewport" content="width=device-width"><body style="margin:0;background:#cfc8bb;display:grid;place-items:center;padding:24px;font:15px/1.5 'Courier New',monospace">
<div style="background:#fbfaf6;width:300px;padding:28px 24px;box-shadow:0 2px 12px rgb(0 0 0/.2);transform:rotate(-2deg)">
<div style="text-align:center;font-weight:bold;font-size:18px">CORNER DELI</div>
<div style="text-align:center;margin-bottom:14px">14 Market St, London</div>
<div style="display:flex;justify-content:space-between"><span>Sourdough loaf</span><span>4.20</span></div>
<div style="display:flex;justify-content:space-between"><span>Comté 200g</span><span>6.80</span></div>
<div style="display:flex;justify-content:space-between"><span>Olives</span><span>3.50</span></div>
<div style="display:flex;justify-content:space-between"><span>Flat white</span><span>3.40</span></div>
<div style="border-top:1px dashed #000;margin-top:10px;padding-top:8px;display:flex;justify-content:space-between;font-weight:bold"><span>TOTAL GBP</span><span>17.90</span></div>
<div style="text-align:center;margin-top:14px">CARD **** 4417 · THANK YOU</div>
</div></body>`;

async function answered(page: Page) {
  await page.getByText("Working on it…").waitFor({ timeout: 10_000 });
  let last = "";
  let still = 0;
  for (let i = 0; i < 360 && still < 4; i++) {
    await page.waitForTimeout(500);
    const text = (await page.locator("body").textContent()) ?? "";
    const busy = text.includes("Working on it…") || (await page.getByRole("button", { name: "Stop" }).count()) > 0;
    still = !busy && text === last ? still + 1 : 0;
    last = text;
  }
}

async function checkIn(api: APIRequestContext) {
  await api.post("/api/check-in").catch(() => {});
  for (let i = 0; i < 120; i++) {
    const chats: { unread: boolean }[] = await (await api.get("/api/chats")).json();
    if (chats.some((c) => c.unread)) return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("no check-in after 4 minutes");
}

export const clips: Record<string, Scene> = {
  add: {
    run: async ({ page }) => {
      await type(page, "ramen 24.50 #friends");
      await page.waitForTimeout(900);
      await page.keyboard.press("Enter");
      await page
        .getByRole("button", { name: /^ramen/ })
        .first()
        .waitFor();
    },
    crop: ledger,
  },
  dictate: {
    run: async ({ page, wait }) => {
      await page.waitForTimeout(500);
      await page.getByRole("button", { name: "Dictate" }).click();
      await page.waitForTimeout(2200);
      await page.getByRole("button", { name: "Stop recording" }).click();
      await wait(() => expect(bar(page)).not.toHaveValue("", { timeout: 30_000 }));
      await page.waitForTimeout(1000);
      await page.keyboard.press("Enter");
      await page
        .getByRole("button", { name: /^taxi home/ })
        .first()
        .waitFor();
    },
    crop: ledger,
  },
  receipt: {
    run: async ({ page, wait }) => {
      const shot = await page.context().newPage();
      await shot.setViewportSize({ width: 380, height: 420 });
      await shot.setContent(receipt);
      const buffer = await shot.locator("body").screenshot();
      await shot.close();
      const chooser = page.waitForEvent("filechooser");
      await page.waitForTimeout(500);
      await page.getByRole("button", { name: "Add from a photo" }).click();
      await (await chooser).setFiles({ name: "receipt.png", mimeType: "image/png", buffer });
      const review = page.getByRole("region", { name: "Review expense" });
      await page.waitForTimeout(1000);
      await wait(() => review.getByLabel("Note", { exact: true }).waitFor({ timeout: 120_000 }));
      await page.waitForTimeout(2200);
      await review.getByRole("button", { name: "Save", exact: true }).click();
      await page
        .getByRole("button", { name: /Corner Deli/i })
        .first()
        .waitFor();
    },
    crop: ledger,
  },
  ask: {
    run: async ({ page, wait }) => {
      await type(page, "?how much did we spend eating out since summer");
      await page.keyboard.press("Enter");
      await wait(() => answered(page));
      await page.waitForTimeout(2500);
    },
    crop: async (page) =>
      fit(
        page,
        await top(composer(page)),
        [(await edge(page.locator("section[aria-live=polite]"), "bottom")) + gap],
        700,
      ),
  },
  "check-in": {
    before: checkIn,
    open: (page) => place(composer(page), gap, "instant"),
    run: async ({ page, wait }) => {
      const card = page.getByRole("link", { name: /Check-in/ }).first();
      await card.waitFor();
      await page.waitForTimeout(2200);
      await card.click();
      await page.waitForTimeout(1500);
      await page
        .getByText(/spotify/i)
        .first()
        .evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" }));
      await page.waitForTimeout(2000);
      await type(page, "make spotify recurring");
      await page.keyboard.press("Enter");
      await wait(() => answered(page));
      const below = await edge(page.getByRole("button", { name: "Chats" }).locator(".."), "bottom");
      await place(sent(page), below + gap / 2, "smooth");
    },
    crop: async (page) => ({
      top: gap / 2 - 6,
      bottom: await edge(page.getByText(/^Answers come from your own data/), "top"),
    }),
  },
  stats: {
    open: async (page) => {
      await page.getByRole("link", { name: "Stats", exact: true }).click();
      await page.getByRole("button", { name: /Food/ }).waitFor();
      await page.waitForTimeout(1000);
      await place(page.getByText("By category", { exact: true }), gap * 2, "instant");
    },
    run: async ({ page }) => {
      await page.waitForTimeout(1500);
      await page.getByRole("button", { name: /Food/ }).click();
      await page.waitForTimeout(2000);
    },
    crop: async (page) => {
      const list = page.locator("ul").filter({ has: page.getByRole("button", { name: /Food/ }) });
      const end = Math.max(...(await edges(list.locator("xpath=following-sibling::p[1]").or(list))));
      return fit(
        page,
        await top(page.getByText("By category", { exact: true })),
        [...(await edges(list.locator(":scope > li"))), end + gap],
        600,
      );
    },
  },
};
