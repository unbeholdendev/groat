import { expect, test } from "bun:test";
import { draft } from "../web/lib/schemas";
import { completion, models, setup } from "./harness";

const ai = { baseUrl: "https://ai.test/v1", key: "sk-test" };

function providers(text: string, listed = models(["test-model", "whisper-1"])) {
  const heard: { url: string; auth: string | null; model: unknown; file: unknown }[] = [];
  const handler = (url: URL, init?: RequestInit) => {
    if (url.pathname.endsWith("/audio/transcriptions") && init?.body instanceof FormData) {
      heard.push({
        url: url.href,
        auth: new Headers(init.headers).get("authorization"),
        model: init.body.get("model"),
        file: init.body.get("file"),
      });
      return Response.json({ text });
    }
    if (url.href !== "https://ai.test/v1/chat/completions") return listed(url);
    const args = { note: "Taxi home", amount: "14" };
    return completion({
      role: "assistant",
      content: null,
      tool_calls: [{ id: "c", type: "function", function: { name: "transaction", arguments: JSON.stringify(args) } }],
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
  const { request, call } = setup(undefined, p.handler, ai);
  expect((await call("GET", "/api/ai/status")).body.voice).toBe(true);

  const res = await record(request);
  const body = await res.json();
  expect(res.status).toBe(200);
  expect(body).toMatchObject({ note: "Taxi home", amount: 1400 });
  expect(draft.safeParse(body).error).toBeUndefined();
  expect(p.heard).toHaveLength(1);
  expect(p.heard[0]).toMatchObject({
    url: "https://ai.test/v1/audio/transcriptions",
    auth: "Bearer sk-test",
    model: "whisper-1",
  });
  expect(p.heard[0].file).toBeInstanceOf(File);
  expect((await call("GET", "/api/transactions")).body).toEqual([]);
});

test("a separate speech-to-text base and key are used when set", async () => {
  const p = providers("taxi", (url) => models(["test-model"])(url) ?? models(["whisper"], "https://stt.test/v1")(url));
  const { request } = setup(undefined, p.handler, { ...ai, sttBaseUrl: "https://stt.test/v1", sttKey: "stt-key" });
  expect((await record(request)).status).toBe(200);
  expect(p.heard[0]).toMatchObject({ url: "https://stt.test/v1/audio/transcriptions", auth: "Bearer stt-key" });
});

test("voice is off without a speech-to-text model, and bad input or replies are reported", async () => {
  const off = setup(undefined, providers("taxi", models(["test-model"])).handler, ai);
  expect((await off.call("GET", "/api/ai/status")).body.voice).toBe(false);
  expect((await record(off.request)).status).toBe(403);

  const silent = setup(undefined, providers(" ").handler, ai);
  expect((await record(silent.request)).status).toBe(422);
  expect((await silent.request("/api/voice", { method: "POST", body: new FormData() })).status).toBe(400);

  const broken = setup(
    undefined,
    (url) => models(["test-model", "whisper-1"])(url) ?? new Response("down", { status: 500 }),
    ai,
  );
  expect((await record(broken.request)).status).toBe(502);
});

test("a speech-to-text failure is a 502 that says what went wrong", async () => {
  const broken = setup(
    undefined,
    (url) => models(["test-model", "whisper-1"])(url) ?? new Response("down", { status: 500 }),
    ai,
  );
  const res = await record(broken.request);
  expect({ status: res.status, body: await res.json() }).toEqual({
    status: 502,
    body: { error: "The speech-to-text provider returned an error (500)" },
  });
});
