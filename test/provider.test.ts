import { expect, test } from "bun:test";
import { aiProvider } from "../web/lib/schemas";
import { setup } from "./harness";

const key = "sk-live-0123456789abcd";
const sttKey = "stt-live-9876543210wxyz";

function provider(keys: Record<string, string> = { "https://ai.test/v1": key, "https://stt.test/v1": sttKey }) {
  const auth: string[] = [];
  const handler = (url: URL, init?: RequestInit) => {
    const base = `${url.origin}/v1`;
    if (!(base in keys)) return;
    const sent = new Headers(init?.headers).get("authorization") ?? "";
    auth.push(`${url.host}${url.pathname} ${sent}`);
    if (sent !== `Bearer ${keys[base]}`) return Response.json({ error: "bad key" }, { status: 401 });
    if (url.pathname === "/v1/models") return Response.json({ data: (url.host === "stt.test" ? ["whisper-large-v3"] : ["gpt-4o-mini", "whisper-1"]).map((id) => ({ id })) });
    if (url.pathname === "/v1/audio/transcriptions") return Response.json({ text: "taxi 14" });
    const drafting = JSON.parse(String(init?.body)).tool_choice;
    const call = { id: "c", type: "function", function: { name: "transaction", arguments: JSON.stringify({ note: "Taxi", amount: "14" }) } };
    return Response.json({ choices: [{ message: { role: "assistant", content: drafting ? null : "Hi", tool_calls: drafting ? [call] : undefined } }] });
  };
  return { handler, auth };
}

const member = async (h: ReturnType<typeof setup>) => {
  await h.call("POST", "/api/users", { username: "sam", password: "pw" });
  const login = await h.app.request("/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "sam", password: "pw" }) });
  const cookie = login.headers.get("set-cookie")!.split(";")[0];
  return (method: string, path: string, body?: unknown) => h.app.request(path, { method, headers: { cookie, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
};

const off = { baseUrl: null, keyEnding: null, sttBaseUrl: null, sttKeyEnding: null };

test("an admin sets the provider in Settings and AI turns on without a restart", async () => {
  const p = provider();
  const { call, request } = setup(undefined, p.handler);
  expect((await call("GET", "/api/ai")).body).toEqual(off);
  expect((await call("GET", "/api/settings")).body).toMatchObject({ ai: false, vision: false, voice: false });

  const saved = await call("PUT", "/api/ai", { baseUrl: " https://ai.test/v1/ ", key });
  expect(saved).toEqual({ status: 200, body: { baseUrl: "https://ai.test/v1", keyEnding: "abcd", sttBaseUrl: null, sttKeyEnding: null } });
  expect(aiProvider.parse(saved.body)).toEqual(saved.body);
  expect((await call("GET", "/api/settings")).body).toMatchObject({ ai: true, vision: true, voice: true });
  expect((await call("POST", "/api/chats", { message: "hi" })).status).toBe(201);
  const form = new FormData();
  form.append("audio", new File([new Uint8Array([1])], "voice.webm", { type: "audio/webm" }));
  expect((await request("/api/voice", { method: "POST", body: form })).status).toBe(200);
  expect(p.auth).toContain(`ai.test/v1/chat/completions Bearer ${key}`);
  expect(p.auth).toContain(`ai.test/v1/audio/transcriptions Bearer ${key}`);
});

test("a separate speech-to-text provider has its own URL and key", async () => {
  const p = provider();
  const { call } = setup(undefined, p.handler);
  const saved = await call("PUT", "/api/ai", { baseUrl: "https://ai.test/v1", key, sttBaseUrl: "https://stt.test/v1", sttKey });
  expect(saved.body).toEqual({ baseUrl: "https://ai.test/v1", keyEnding: "abcd", sttBaseUrl: "https://stt.test/v1", sttKeyEnding: "wxyz" });
  expect((await call("GET", "/api/models")).body.stt).toEqual({ models: ["whisper-large-v3"], model: "whisper-large-v3" });
  expect(p.auth).toContain(`stt.test/v1/models Bearer ${sttKey}`);
});

test("no response contains a saved key, even to admins", async () => {
  const { call, request } = setup(undefined, provider().handler);
  const responses = [
    await request("/api/ai", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ baseUrl: "https://ai.test/v1", key, sttBaseUrl: "https://stt.test/v1", sttKey }) }),
    await request("/api/ai", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ baseUrl: "https://ai.test/v1", sttBaseUrl: "https://stt.test/v1" }) }),
    ...(await Promise.all(["/api/ai", "/api/settings", "/api/models", "/api/session", "/api/users"].map((path) => request(path)))),
    await request("/api/models", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat: "gpt-4o-mini" }) }),
  ];
  for (const res of responses) {
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(text).not.toContain(key.slice(0, -4));
    expect(text).not.toContain(sttKey.slice(0, -4));
  }
  expect((await call("GET", "/api/ai")).body).toMatchObject({ keyEnding: "abcd", sttKeyEnding: "wxyz" });
});

test("a blank key keeps the saved one, but not for a new URL", async () => {
  const p = provider({ "https://ai.test/v1": key, "https://other.test/v1": key });
  const { call } = setup(undefined, p.handler);
  await call("PUT", "/api/ai", { baseUrl: "https://ai.test/v1", key });
  expect((await call("PUT", "/api/ai", { baseUrl: "https://ai.test/v1" })).body.keyEnding).toBe("abcd");
  expect(await call("PUT", "/api/ai", { baseUrl: "https://other.test/v1" })).toEqual({ status: 400, body: { error: "Enter the API key" } });
  expect((await call("GET", "/api/ai")).body.baseUrl).toBe("https://ai.test/v1");
  expect(p.auth.filter((a) => a.includes("other.test"))).toEqual([]);
});

test("a bad URL or key can't be saved, and the error says why", async () => {
  const unreachable = (url: URL) => {
    if (url.host === "down.test") throw new TypeError("Unable to connect");
    if (url.host === "html.test") return new Response("<html>");
    return provider().handler(url);
  };
  const { call } = setup(undefined, (url, init) => (url.host === "ai.test" ? provider().handler(url, init) : unreachable(url)));
  const cases: [object, RegExp][] = [
    [{ baseUrl: "not a url", key }, /URL/],
    [{ baseUrl: "ftp://ai.test/v1", key }, /http/],
    [{ baseUrl: "https://ai.test/v1" }, /API key/],
    [{ baseUrl: "https://ai.test/v1", key: "sk-wrong-key-0000" }, /401/],
    [{ baseUrl: "https://down.test/v1", key }, /Couldn’t reach https:\/\/down\.test\/v1/],
    [{ baseUrl: "https://html.test/v1", key }, /unexpected/],
    [{ baseUrl: "https://ai.test/v1", key, sttBaseUrl: "https://stt.test/v1", sttKey: "stt-wrong-key-00" }, /speech-to-text.*401/i],
    [{ baseUrl: "https://ai.test/v1", key, sttBaseUrl: "https://down.test/v1" }, /Couldn’t reach https:\/\/down\.test\/v1/],
  ];
  for (const [body, error] of cases) {
    const res = await call("PUT", "/api/ai", body);
    expect([body, res.status]).toEqual([body, 400]);
    expect(res.body.error).toMatch(error);
  }
  expect((await call("GET", "/api/ai")).body).toEqual(off);
  expect((await call("GET", "/api/settings")).body.ai).toBe(false);
});

test("an empty base URL turns AI off and forgets both keys", async () => {
  const { call } = setup(undefined, provider().handler);
  await call("PUT", "/api/ai", { baseUrl: "https://ai.test/v1", key, sttBaseUrl: "https://stt.test/v1", sttKey });
  expect(await call("PUT", "/api/ai", { baseUrl: "" })).toEqual({ status: 200, body: off });
  expect((await call("GET", "/api/settings")).body).toMatchObject({ ai: false, voice: false });
  expect(await call("PUT", "/api/ai", { baseUrl: "https://ai.test/v1" })).toEqual({ status: 400, body: { error: "Enter the API key" } });
});

test("a speech-to-text key can be removed to fall back to the main key", async () => {
  const p = provider({ "https://ai.test/v1": key });
  const { call } = setup(undefined, (url, init) => (new Headers(init?.headers).get("authorization") === `Bearer ${sttKey}` ? Response.json({ data: [{ id: "whisper-1" }] }) : p.handler(url, init)));
  await call("PUT", "/api/ai", { baseUrl: "https://ai.test/v1", key, sttKey });
  expect((await call("PUT", "/api/ai", { baseUrl: "https://ai.test/v1", sttKey: "" })).body).toEqual({ baseUrl: "https://ai.test/v1", keyEnding: "abcd", sttBaseUrl: null, sttKeyEnding: null });
});

test("switching provider drops model choices it doesn't list", async () => {
  const p = provider({ "https://ai.test/v1": key, "https://other.test/v1": key });
  const { call } = setup(undefined, (url, init) =>
    url.host === "other.test" && url.pathname === "/v1/models" ? Response.json({ data: [{ id: "llama" }, { id: "gpt-4o-mini" }] }) : p.handler(url, init),
  );
  await call("PUT", "/api/ai", { baseUrl: "https://ai.test/v1", key });
  await call("PUT", "/api/models", { chat: "gpt-4o-mini", stt: "whisper-1" });
  await call("PUT", "/api/ai", { baseUrl: "https://other.test/v1", key });
  expect((await call("GET", "/api/models")).body).toMatchObject({ chat: { model: "gpt-4o-mini" }, stt: { model: null } });
});

test("members who aren't admins can't read or change the AI provider", async () => {
  const h = setup(undefined, provider().handler);
  await h.call("PUT", "/api/ai", { baseUrl: "https://ai.test/v1", key });
  const as = await member(h);
  expect((await as("GET", "/api/ai")).status).toBe(403);
  expect((await as("PUT", "/api/ai", { baseUrl: "" })).status).toBe(403);
  expect((await as("PUT", "/api/ai", { baseUrl: "https://ai.test/v1", key: "sk-evil-key-1234" })).status).toBe(403);
  expect((await h.call("GET", "/api/ai")).body).toMatchObject({ baseUrl: "https://ai.test/v1", keyEnding: "abcd" });
  expect(await (await as("GET", "/api/settings")).text()).not.toContain(key.slice(0, -4));
});

test("a saved key isn't sent to a new speech-to-text URL", async () => {
  const p = provider({ "https://ai.test/v1": key, "https://stt.test/v1": key });
  const { call } = setup(undefined, p.handler);
  await call("PUT", "/api/ai", { baseUrl: "https://ai.test/v1", key });
  expect(await call("PUT", "/api/ai", { baseUrl: "https://ai.test/v1", sttBaseUrl: "https://stt.test/v1" })).toEqual({ status: 400, body: { error: "Enter the speech-to-text key" } });
  expect(p.auth.filter((a) => a.includes("stt.test"))).toEqual([]);
  expect((await call("GET", "/api/ai")).body.sttBaseUrl).toBeNull();
  expect((await call("PUT", "/api/ai", { baseUrl: "https://ai.test/v1", sttBaseUrl: "https://stt.test/v1", key })).status).toBe(200);
});

test("a model choice validated against the old provider isn't saved after a switch", async () => {
  let release = () => {};
  let hold = false;
  const gate = new Promise<void>((r) => (release = r));
  const lists: Record<string, string[]> = { "ai.test": ["gpt-4o", "a-only"], "other.test": ["gpt-4o", "llama"] };
  const { call } = setup(undefined, async (url) => {
    if (url.pathname !== "/v1/models" || !(url.host in lists)) return new Response("not found", { status: 404 });
    if (hold && url.host === "ai.test") await gate;
    return Response.json({ data: lists[url.host].map((id) => ({ id })) });
  });
  await call("PUT", "/api/ai", { baseUrl: "https://ai.test/v1", key });
  hold = true;
  const pick = call("PUT", "/api/models", { chat: "a-only" });
  await Bun.sleep(5);
  expect((await call("PUT", "/api/ai", { baseUrl: "https://other.test/v1", key })).status).toBe(200);
  release();
  expect((await pick).status).toBe(409);
  expect((await call("GET", "/api/models")).body.chat.model).toBeNull();
});
