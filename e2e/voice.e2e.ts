import { bar, expect, test } from "./fixtures";

test.use({ ai: ["gpt-4o-mini", "whisper-1"], serviceWorkers: "block" });

test.beforeEach(async ({ app: page }) => {
  await page.evaluate(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: async () => ({ getTracks: () => [] }) },
    });
    Object.defineProperty(window, "MediaRecorder", {
      value: class {
        state = "inactive";
        mimeType = "audio/webm";
        ondataavailable = (_event: { data: Blob }) => {};
        onstop = () => {};
        start() {
          this.state = "recording";
        }
        stop() {
          this.state = "inactive";
          this.ondataavailable({ data: new Blob(["recorded audio"], { type: this.mimeType }) });
          this.onstop();
        }
      },
    });
  });
});

for (const prefix of ["", "morning"]) {
  test(`dictation fills an editable input${prefix ? " after existing text" : ""} and waits for submission`, async ({
    app: page,
  }) => {
    const drafts: string[] = [];
    page.on("request", (r) => {
      if (r.url().endsWith("/api/drafts")) drafts.push(r.url());
    });
    await bar(page).fill(prefix);
    await page.getByRole("button", { name: "Dictate", exact: true }).click();
    await page.getByRole("button", { name: "Stop recording" }).click();
    await expect(bar(page)).toHaveValue(`${prefix ? `${prefix} ` : ""}coffee 3`);
    await expect(bar(page)).toBeFocused();
    await expect(page.getByRole("region", { name: "Review expense" })).toBeHidden();
    expect(await (await page.request.get("/api/transactions")).json()).toEqual([]);
    expect(drafts).toEqual([]);
    await bar(page).fill("Edited coffee 4");
    await bar(page).press("Enter");
    await expect(bar(page)).toHaveValue("");
    await expect(page.getByRole("listitem").filter({ hasText: "Edited coffee" })).toContainText("£4.00");
  });
}

test("a failed transcription preserves the input", async ({ app: page }) => {
  await page.route("**/api/voice", (route) =>
    route.fulfill({ status: 502, json: { error: "The speech-to-text provider returned an error (500)" } }),
  );
  await bar(page).fill("morning");
  await page.getByRole("button", { name: "Dictate", exact: true }).click();
  await page.getByRole("button", { name: "Stop recording" }).click();
  await expect(page.getByText("The speech-to-text provider returned an error (500)", { exact: true })).toBeVisible();
  await expect(bar(page)).toHaveValue("morning");
});
