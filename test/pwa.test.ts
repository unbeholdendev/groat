import { expect, test } from "bun:test";
import { setup } from "./harness";

test("manifest makes the app installable and opens on the add screen", async () => {
  const { app } = setup();
  const res = await app.request("/manifest.webmanifest");
  expect(res.headers.get("content-type")).toContain("application/manifest+json");
  const manifest = await res.json();
  expect(manifest).toMatchObject({ start_url: "/", display: "standalone" });
  expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(["192x192", "512x512"]);
});

test("service worker is served and leaves the API to the network", async () => {
  const { app } = setup();
  const res = await app.request("/sw.js");
  expect(res.headers.get("content-type")).toContain("javascript");
  expect(await res.text()).toContain('"/api/"');
});

test("API responses are not cacheable", async () => {
  const { app } = setup();
  const res = await app.request("/api/transactions");
  expect(res.headers.get("cache-control")).toBe("no-store");
});
