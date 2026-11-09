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

test("install identity and icon purposes are explicit", async () => {
  const { app } = setup();
  const manifest = await (await app.request("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ id: "/", scope: "/" });
  expect(manifest.icons.find((icon: { purpose?: string }) => icon.purpose?.split(" ").includes("maskable"))).toMatchObject({ sizes: "512x512" });
});

test("HTML advertises favicon and iOS installation metadata", async () => {
  const html = await Bun.file("web/index.html").text();
  expect(html).toContain('rel="icon"');
  expect(html).toContain('sizes="180x180"');
  expect(html).toContain('name="apple-mobile-web-app-capable" content="yes"');
});

test("worker ignores private, unknown and cross-origin requests", async () => {
  const { runInNewContext } = await import("node:vm");
  let fetchHandler: (event: { request: Request; respondWith: () => void }) => void = () => {};
  runInNewContext(await Bun.file("server/sw.js").text(), {
    URL,
    location: { origin: "https://groat.test" },
    self: { addEventListener: (type: string, handler: typeof fetchHandler) => { if (type === "fetch") fetchHandler = handler; } },
  });
  for (const path of ["/api", "/api/transactions", "/private.png", "https://other.test/icon-192.png", "https://other.test/share"]) {
    let intercepted = false;
    fetchHandler({ request: new Request(new URL(path, "https://groat.test"), { method: path.endsWith("/share") ? "POST" : "GET" }), respondWith: () => { intercepted = true; } });
    expect(intercepted).toBe(false);
  }
});

test("public icon URLs serve image bytes with the declared dimensions", async () => {
  const { serveStatic } = await import("hono/bun");
  const { app } = setup();
  app.use("*", serveStatic({ root: "./web/public" }));
  const manifest = await (await app.request("/manifest.webmanifest")).json();
  const icons = [...manifest.icons, { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }];
  for (const icon of icons) {
    const res = await app.request(icon.src);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain(icon.type);
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`).toBe(icon.sizes);
  }
  const favicon = await app.request("/favicon.ico");
  expect(favicon.status).toBe(200);
  expect(favicon.headers.get("content-type")).toContain("image/");
  const bytes = Buffer.from(await favicon.arrayBuffer());
  expect(bytes.readUInt16LE(2)).toBe(1);
  expect([bytes[6], bytes[7]]).toEqual([32, 32]);
});
