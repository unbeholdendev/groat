import AxeBuilder from "@axe-core/playwright";
import { expect, seed, test } from "./fixtures";

for (const theme of ["light", "dark"])
  test(`no accessibility problems above minor in ${theme}`, async ({ app: page }) => {
    test.setTimeout(90_000);
    await page.request.put("/api/settings", { data: { theme } });
    await seed(page, [
      { note: "Ramen", amount: "24.50", categoryId: 6, tags: ["friends"] },
      { note: "Lunch", amount: "10", currency: "EUR", categoryId: 6 },
    ]);
    await page.request.post("/api/recurring", {
      data: {
        note: "Rent",
        amount: "900",
        currency: "GBP",
        period: "month",
        every: 1,
        startDate: new Date().toLocaleDateString("en-CA"),
        needsConfirmation: true,
      },
    });
    const found: string[] = [];
    for (const path of ["/", "/stats", "/categories", "/settings", "/?new=1", "/?view=recurring", "/?view=bin"]) {
      await page.goto(path);
      await page.waitForTimeout(1200);
      const { violations } = await new AxeBuilder({ page }).analyze();
      for (const v of violations.filter((v) => v.impact !== "minor"))
        found.push(
          `${path} ${v.id}: ${v.nodes
            .map((n) => n.target.join(" ") + " — " + n.failureSummary?.split("\n")[1])
            .slice(0, 4)
            .join(" | ")}`,
        );
    }
    expect(found).toEqual([]);
  });
