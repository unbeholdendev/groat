import { expect, test } from "bun:test";
import { setup } from "./harness";

test("the manifest declares an image share target that the service worker handles", async () => {
  const { app } = setup();
  const manifest = await (await app.request("/manifest.webmanifest")).json();
  expect(manifest.share_target).toMatchObject({ action: "/share", method: "POST", enctype: "multipart/form-data" });
  expect(manifest.share_target.params.files[0]).toMatchObject({ name: "image", accept: ["image/*"] });
  expect(await (await app.request("/sw.js")).text()).toContain('url.pathname === "/share"');
});
