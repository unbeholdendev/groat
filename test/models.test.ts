import { expect, test } from "bun:test";
import { models as modelChoice } from "../web/lib/schemas";
import { models, setup, type Ai } from "./harness";

const config: Ai = { baseUrl: "https://ai.test/v1", key: "sk-test" };

function provider(ids: (string | object)[], stt?: { ids: string[]; base: string }) {
  const used: { chat: unknown[]; stt: unknown[] } = { chat: [], stt: [] };
  const listed = models(ids);
  const sttListed = stt && models(stt.ids, stt.base);
  const handler = (url: URL, init?: RequestInit) => {
    const list = listed(url) ?? sttListed?.(url);
    if (list) return list;
    if (url.pathname.endsWith("/audio/transcriptions") && init?.body instanceof FormData) {
      used.stt.push(init.body.get("model"));
      return Response.json({ text: "taxi" });
    }
    if (url.href !== "https://ai.test/v1/chat/completions") return;
    const body = JSON.parse(String(init?.body));
    used.chat.push(body.model);
    const args = JSON.stringify({ note: "Taxi", amount: "14" });
    return Response.json({ choices: [{ message: { role: "assistant", content: body.tool_choice ? null : "hi", tool_calls: body.tool_choice ? [{ id: "c", type: "function", function: { name: "transaction", arguments: args } }] : undefined } }] });
  };
  return { handler, used };
}

const flags = async (call: ReturnType<typeof setup>["call"]) => {
  const { ai, vision, voice } = (await call("GET", "/api/settings")).body;
  return { ai, vision, voice };
};

const record = (request: ReturnType<typeof setup>["request"]) => {
  const form = new FormData();
  form.append("audio", new File([new Uint8Array([1])], "voice.webm", { type: "audio/webm" }));
  return request("/api/voice", { method: "POST", body: form });
};

test("with one chat model and one speech model listed, everything turns on with no choice made", async () => {
  const p = provider(["text-embedding-3-small", "gpt-4o-mini", "whisper-1", "tts-1", "dall-e-3", "omni-moderation-latest"]);
  const { call, request } = setup(undefined, p.handler, config);
  expect(await flags(call)).toEqual({ ai: true, vision: true, voice: true });
  await call("POST", "/api/chats", { message: "hi" });
  expect((await record(request)).status).toBe(200);
  expect(p.used).toEqual({ chat: ["gpt-4o-mini", "gpt-4o-mini"], stt: ["whisper-1"] });
  expect(modelChoice.parse((await call("GET", "/api/models")).body)).toEqual({
    chat: { models: ["gpt-4o-mini"], model: "gpt-4o-mini" },
    vision: { models: ["gpt-4o-mini"], model: "gpt-4o-mini" },
    stt: { models: ["whisper-1"], model: "whisper-1" },
  });
});

test("with several candidates nothing is guessed, and an admin's picks apply without a restart", async () => {
  const p = provider(["gpt-4o", "gpt-4o-mini", "whisper-1", "gpt-4o-transcribe"]);
  const { call, request } = setup(undefined, p.handler, config);
  expect(await flags(call)).toEqual({ ai: false, vision: false, voice: false });
  expect((await call("POST", "/api/chats", { message: "hi" })).status).toBe(403);
  expect((await call("GET", "/api/models")).body).toMatchObject({ chat: { models: ["gpt-4o", "gpt-4o-mini"], model: null }, stt: { model: null } });

  expect((await call("PUT", "/api/models", { chat: "gpt-4o-mini" })).body).toMatchObject({ chat: { model: "gpt-4o-mini" }, vision: { model: "gpt-4o-mini" } });
  expect(await flags(call)).toEqual({ ai: true, vision: true, voice: false });
  await call("POST", "/api/chats", { message: "hi" });

  await call("PUT", "/api/models", { vision: "gpt-4o", stt: "gpt-4o-transcribe" });
  expect(await flags(call)).toEqual({ ai: true, vision: true, voice: true });
  expect((await record(request)).status).toBe(200);
  const photo = new FormData();
  photo.set("image", new File([Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1])], "receipt", { type: "image/jpeg" }));
  expect((await request("/api/drafts/photo", { method: "POST", body: photo })).status).toBe(200);
  expect(p.used).toEqual({ chat: ["gpt-4o-mini", "gpt-4o-mini", "gpt-4o"], stt: ["gpt-4o-transcribe"] });
});

test("an unknown or missing model can't be saved", async () => {
  const { call } = setup(undefined, provider(["gpt-4o", "gpt-4o-mini", "text-embedding-3-small"]).handler, config);
  for (const body of [{ chat: "gpt-5" }, { chat: "" }, { chat: null }, { vision: "text-embedding-3-small" }, { stt: "nope" }, { chat: 4 }])
    expect(await call("PUT", "/api/models", body)).toMatchObject({ status: 400, body: { error: expect.any(String) } });
  expect((await call("GET", "/api/models")).body).toMatchObject({ chat: { model: null }, vision: { model: null }, stt: { model: null } });
});

test("members who aren't admins can't see or change models", async () => {
  const h = setup(undefined, provider(["gpt-4o", "gpt-4o-mini"]).handler, config);
  await h.call("POST", "/api/users", { username: "sam", password: "pw" });
  const login = await h.app.request("/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "sam", password: "pw" }) });
  const cookie = login.headers.get("set-cookie")!.split(";")[0];
  const as = (method: string, body?: unknown) => h.app.request("/api/models", { method, headers: { cookie, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  expect((await as("GET")).status).toBe(403);
  expect((await as("PUT", { chat: "gpt-4o" })).status).toBe(403);
  expect((await h.call("GET", "/api/models")).body.chat.model).toBeNull();
});

test("architecture modalities, when listed, decide what counts as a chat model", async () => {
  const p = provider([
    { id: "openai/gpt-4o-audio-preview", architecture: { input_modalities: ["text", "audio"], output_modalities: ["text"] } },
    { id: "voyage/embed-thing", architecture: { input_modalities: ["text"], output_modalities: ["embeddings"] } },
    { id: "some/image-maker", architecture: { input_modalities: ["text"], output_modalities: ["image"] } },
  ]);
  const { call } = setup(undefined, p.handler, config);
  expect((await call("GET", "/api/models")).body.chat).toEqual({ models: ["openai/gpt-4o-audio-preview"], model: "openai/gpt-4o-audio-preview" });
});

test("a separate speech-to-text provider lists all its models when none look like speech ones", async () => {
  const p = provider(["gpt-4o-mini"], { ids: ["parakeet", "canary"], base: "https://stt.test/v1" });
  const { call } = setup(undefined, p.handler, { ...config, sttBaseUrl: "https://stt.test/v1", sttKey: "stt-key" });
  expect((await call("GET", "/api/models")).body.stt).toEqual({ models: ["parakeet", "canary"], model: null });
  await call("PUT", "/api/models", { stt: "parakeet" });
  expect((await flags(call)).voice).toBe(true);
  expect((await call("PUT", "/api/models", { stt: "gpt-4o-mini" })).status).toBe(400);
});

test("without a base URL and key there is nothing to choose, and a failing list keeps AI off", async () => {
  const none = setup(undefined, provider(["gpt-4o-mini"]).handler, { baseUrl: "https://ai.test/v1" });
  expect((await none.call("GET", "/api/models")).body).toBeNull();
  expect((await none.call("PUT", "/api/models", { chat: "gpt-4o-mini" })).status).toBe(400);
  expect(await flags(none.call)).toEqual({ ai: false, vision: false, voice: false });

  const down = setup(undefined, () => new Response("down", { status: 500 }), config);
  expect(await flags(down.call)).toEqual({ ai: false, vision: false, voice: false });
  expect((await down.call("GET", "/api/models")).body.chat).toMatchObject({ models: [], model: null, error: expect.stringContaining("500") });
});

test("Settings keeps the last model list when the provider later fails to list", async () => {
  const p = provider(["gpt-4o", "gpt-4o-mini"]);
  let down = false;
  const { call } = setup(undefined, (url, init) => (down && url.pathname.endsWith("/models") ? new Response("busy", { status: 429 }) : p.handler(url, init)), config);
  expect((await call("GET", "/api/models")).body.chat.models).toEqual(["gpt-4o", "gpt-4o-mini"]);
  down = true;
  expect((await call("GET", "/api/models")).body.chat.models).toEqual(["gpt-4o", "gpt-4o-mini"]);
  expect((await call("PUT", "/api/models", { chat: "gpt-4o" })).body.chat.model).toBe("gpt-4o");
});

test("chat and speech-to-text keys at the same URL keep their own model lists", async () => {
  const handler = (url: URL, init?: RequestInit) => {
    if (url.href !== "https://ai.test/v1/models") return;
    const stt = new Headers(init?.headers).get("authorization") === "Bearer stt-key";
    return Response.json({ data: (stt ? ["whisper-1"] : ["gpt-4o-mini", "whisper-1", "gpt-4o-transcribe"]).map((id) => ({ id })) });
  };
  const { call } = setup(undefined, handler, { ...config, sttKey: "stt-key" });
  expect(await flags(call)).toEqual({ ai: true, vision: true, voice: true });
  expect((await call("GET", "/api/models")).body.stt).toEqual({ models: ["whisper-1"], model: "whisper-1" });
  expect((await call("GET", "/api/models")).body.chat).toEqual({ models: ["gpt-4o-mini"], model: "gpt-4o-mini" });
});

test("a speech-to-text provider that can't list yet doesn't block choosing the chat model", async () => {
  const p = provider(["gpt-4o", "gpt-4o-mini"], { ids: ["whisper-large-v3"], base: "https://stt.test/v1" });
  let sttDown = true;
  const { call } = setup(undefined, (url, init) => (sttDown && url.host === "stt.test" ? new Response("down", { status: 503 }) : p.handler(url, init)), {
    ...config,
    sttBaseUrl: "https://stt.test/v1",
  });
  const listed = await call("GET", "/api/models");
  expect(listed.status).toBe(200);
  expect(listed.body.chat).toEqual({ models: ["gpt-4o", "gpt-4o-mini"], model: null });
  expect(listed.body.stt).toMatchObject({ models: [], model: null, error: expect.stringContaining("503") });
  expect((await call("PUT", "/api/models", { chat: "gpt-4o", vision: "gpt-4o-mini" })).status).toBe(200);
  expect((await call("PUT", "/api/models", { stt: "whisper-large-v3" })).status).toBe(502);
  expect(await flags(call)).toEqual({ ai: true, vision: true, voice: false });

  sttDown = false;
  expect((await call("GET", "/api/models")).body.stt).toEqual({ models: ["whisper-large-v3"], model: "whisper-large-v3" });
  expect((await flags(call)).voice).toBe(true);
});
