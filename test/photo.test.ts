import { expect, test } from "bun:test";
import { draft, transaction, aiStatus } from "../web/lib/schemas";
import { models, setup, type Ai } from "./harness";

const config: Ai = { baseUrl: "https://ai.test/v1", key: "sk-test" };
const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

function provider(ids = ["text-model"]) {
  const requests: any[] = [];
  const listed = models(ids);
  const handler = (url: URL, init?: RequestInit) => {
    if (url.href !== "https://ai.test/v1/chat/completions") return listed(url);
    requests.push(JSON.parse(String(init?.body)));
    const args = JSON.stringify({ note: "Tesco", amount: "23.45", date: "2026-10-09" });
    return Response.json({ choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "c", type: "function", function: { name: "transaction", arguments: args } }] } }] });
  };
  return { handler, requests };
}

const form = (bytes: BlobPart, type = "image/jpeg") => {
  const body = new FormData();
  body.set("image", new File([bytes], "receipt", { type }));
  return body;
};

function photos(cfg = config, ids?: string[]) {
  const ai = provider(ids);
  const h = setup(undefined, ai.handler, cfg);
  const upload = async (body = form(jpeg)) => {
    const res = await h.request("/api/drafts/photo", { method: "POST", body });
    return { status: res.status, body: await res.json() };
  };
  return { ...h, ai, upload };
}

test("a photo becomes a draft with an attachment, read by the vision model", async () => {
  const { ai, upload, call } = photos(config, ["text-model", "vision-model"]);
  await call("PUT", "/api/models", { chat: "text-model", vision: "vision-model" });
  const res = await upload();
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ note: "Tesco", amount: 2345, date: "2026-10-09" });
  expect(draft.parse(res.body).attachmentId).toBeNumber();
  expect(ai.requests[0].model).toBe("vision-model");
  expect(ai.requests[0].messages[1].content[0].image_url.url).toBe(`data:image/jpeg;base64,${Buffer.from(jpeg).toString("base64")}`);
  expect((await call("GET", "/api/transactions")).body).toEqual([]);
  expect(aiStatus.parse((await call("GET", "/api/ai/status")).body).vision).toBe(true);
});

test("the vision model defaults to the chat model, and photos are off without one", async () => {
  const on = photos();
  await on.upload();
  expect(on.ai.requests[0].model).toBe("text-model");

  const off = photos(config, ["text-model", "other-model"]);
  expect((await off.upload()).status).toBe(403);
  expect((await off.call("GET", "/api/ai/status")).body.vision).toBe(false);
  expect((await photos({}).upload()).status).toBe(403);
});

test("saving links the image, served only to signed-in users, and purging the expense deletes it", async () => {
  const { upload, call, request, app } = photos();
  const { attachmentId } = draft.parse((await upload()).body);
  const saved = transaction.parse((await call("POST", "/api/transactions", { note: "Tesco", amount: "23.45", attachmentId })).body);
  expect(saved.attachmentId).toBe(attachmentId);

  const image = await request(`/api/attachments/${attachmentId}`);
  expect(image.headers.get("content-type")).toBe("image/jpeg");
  expect(new Uint8Array(await image.arrayBuffer())).toEqual(jpeg);
  expect((await app.request(`/api/attachments/${attachmentId}`)).status).toBe(401);

  await call("DELETE", `/api/transactions/${saved.id}`);
  expect((await call("GET", "/api/bin")).body[0].attachmentId).toBe(attachmentId);
  expect((await request(`/api/attachments/${attachmentId}`)).status).toBe(200);
  await call("DELETE", `/api/transactions/${saved.id}?purge`);
  expect((await request(`/api/attachments/${attachmentId}`)).status).toBe(404);
});

test("unlinked images older than a day are purged", async () => {
  const { upload, request, clock } = photos();
  const old = draft.parse((await upload()).body).attachmentId;
  clock.now = new Date("2026-10-11T11:00:00Z");
  await upload();
  expect((await request(`/api/attachments/${old}`)).status).toBe(200);
  clock.now = new Date("2026-10-11T12:30:00Z");
  await upload();
  expect((await request(`/api/attachments/${old}`)).status).toBe(404);
});

test("oversized or non-image uploads are refused", async () => {
  const { upload } = photos();
  expect((await upload(form(new Uint8Array(6 * 1024 * 1024)))).status).toBe(413);
  expect((await upload(form(new TextEncoder().encode("%PDF-1.4"), "application/pdf"))).status).toBe(400);
  expect((await upload(new FormData())).status).toBe(400);
});
