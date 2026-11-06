import { expect, test } from "bun:test";
import { draft } from "../web/lib/schemas";
import { setup } from "./harness";

const ai = { aiBaseUrl: "https://ai.test/v1", aiApiKey: "sk-test", aiModel: "test-model" };

function providers(text: string) {
  const heard: { url: string; auth: string | null; model: unknown; file: unknown }[] = [];
  const handler = (url: URL, init?: RequestInit) => {
    if (url.pathname.endsWith("/audio/transcriptions") && init?.body instanceof FormData) {
      heard.push({ url: url.href, auth: new Headers(init.headers).get("authorization"), model: init.body.get("model"), file: init.body.get("file") });
      return Response.json({ text });
    }
    if (url.href !== "https://ai.test/v1/chat/completions") return;
    const args = { note: "Taxi home", amount: "14" };
    return Response.json({
      choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "c", type: "function", function: { name: "transaction", arguments: JSON.stringify(args) } }] } }],
    });
  };
  return { handler, heard };
}

const record = (request: (path: string, init?: RequestInit) => Response | Promise<Response>) => {
  const form = new FormData();
  form.append("audio", new File([new Uint8Array([1, 2, 3])], "voice.webm", { type: "audio/webm" }));
  return request("/api/voice", { method: "POST", body: form });
};

test("a recording is transcribed and comes back as a draft, using the AI base and key by default", async () => {
  const p = providers("taxi home fourteen pounds");
  const { request, call } = setup(undefined, p.handler, { ...ai, sttModel: "whisper-1" });
  expect((await call("GET", "/api/settings")).body.voice).toBe(true);

  const res = await record(request);
  const body = await res.json();
  expect(res.status).toBe(200);
  expect(body).toMatchObject({ note: "Taxi home", amount: 1400 });
  expect(draft.safeParse(body).error).toBeUndefined();
  expect(p.heard).toHaveLength(1);
  expect(p.heard[0]).toMatchObject({ url: "https://ai.test/v1/audio/transcriptions", auth: "Bearer sk-test", model: "whisper-1" });
  expect(p.heard[0].file).toBeInstanceOf(File);
  expect((await call("GET", "/api/transactions")).body).toEqual([]);
});

test("a separate speech-to-text base and key are used when set", async () => {
  const p = providers("taxi");
  const { request } = setup(undefined, p.handler, { ...ai, sttBaseUrl: "https://stt.test/v1", sttKey: "stt-key", sttModel: "whisper" });
  expect((await record(request)).status).toBe(200);
  expect(p.heard[0]).toMatchObject({ url: "https://stt.test/v1/audio/transcriptions", auth: "Bearer stt-key" });
});

test("voice is refused when it is off, and bad input or replies are reported", async () => {
  const off = setup(undefined, providers("taxi").handler, ai);
  expect((await off.call("GET", "/api/settings")).body.voice).toBe(false);
  expect((await record(off.request)).status).toBe(403);

  const silent = setup(undefined, providers(" ").handler, { ...ai, sttModel: "whisper" });
  expect((await record(silent.request)).status).toBe(422);
  expect((await silent.request("/api/voice", { method: "POST", body: new FormData() })).status).toBe(400);

  const broken = setup(undefined, () => new Response("down", { status: 500 }), { ...ai, sttModel: "whisper" });
  expect((await record(broken.request)).status).toBe(502);
});
