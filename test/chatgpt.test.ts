import { Database } from "bun:sqlite";
import { expect, spyOn, test } from "bun:test";
import { createApp } from "../server/app";
import { responses } from "../server/responses";

async function fixture() {
  const store = new Database(":memory:");
  const db = new Database(":memory:");
  const keys = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, [
    "sign",
    "verify",
  ]);
  const jwk = { ...(await crypto.subtle.exportKey("jwk", keys.publicKey)), kid: "test" };
  let nonce = "";
  let now = Date.now();
  let bad = "";
  let tokenCalls = 0;
  const fetches: string[] = [];
  const auths: string[] = [];
  const revocations: string[] = [];
  const refreshes: string[] = [];
  const app = createApp({
    db,
    credentials: store,
    clock: () => new Date(now),
    fetch: async (input, init) => {
      const url = String(input);
      if (url.endsWith("/oauth/revoke")) revocations.push(new URLSearchParams(String(init?.body)).get("token")!);
      fetches.push(url);
      if (url.endsWith("jwks.json")) return bad === "jwks" ? Response.json({}, { status: 503 }) : Response.json({ keys: [jwk] });
      if (url.endsWith("/oauth/token")) {
        tokenCalls++;
        if (bad === "unavailable") return Response.json({ error: "temporarily_unavailable" }, { status: 503 });
        if (bad === "revoked") return Response.json({ error: "invalid_grant" }, { status: 400 });
        const form = new URLSearchParams(String(init?.body));
        if (form.get("grant_type") === "refresh_token") refreshes.push(form.get("refresh_token")!);
        expect(form.get("client_id")).toBe("oaiapp_test");
        expect(form.get("resource")).toBe("https://api.openai.com/v1");
        const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "test" })).toString("base64url");
        const payload = Buffer.from(
          JSON.stringify({
            iss: bad === "issuer" ? "evil" : "https://auth.openai.com",
            aud: bad === "aud" ? "other" : "oaiapp_test",
            sub: "subject",
            email: "me@example.test",
            nonce: bad === "nonce" ? "other" : nonce,
            exp: now / 1000 + (bad === "expired" ? -1 : 3600),
          }),
        ).toString("base64url");
        const sig = Buffer.from(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", keys.privateKey, Buffer.from(`${header}.${payload}`))).toString("base64url");
        return Response.json({
          access_token: "secret-access",
          refresh_token: `secret-refresh-${tokenCalls}`,
          id_token: `${header}.${payload}.${bad === "signature" ? "bad" : sig}`,
          token_type: "Bearer",
          expires_in: 3600,
          scope: bad === "scope" ? "openid" : "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct",
        });
      }
      if (url === "https://ai.test/v1/models") return Response.json({ data: [{ id: "gpt-a" }, { id: "gpt-b" }, { id: "whisper-1" }] });
      if (url.endsWith("/models")) return Response.json({ models: [{ slug: "chat-test", display_name: "Test model", visibility: "list" }] });
      if (url.endsWith("/responses")) {
        auths.push(new Headers(init?.headers).get("authorization")!);
        return sse("response.completed", {
          output: [
            ...(bad === "reasoning" ? [{ type: "reasoning", encrypted_content: "opaque-reasoning", summary: [] }] : []),
            { type: "message", content: [{ type: "output_text", text: "Hello" }] },
          ],
        });
      }
      return new Response("", { status: 200 });
    },
  });
  db.run("INSERT INTO users (id, username, password_hash, role) VALUES (1, 'one', 'x', 'admin'), (2, 'two', 'x', 'member')");
  db.run("INSERT INTO sessions (id, user_id, expires_at) VALUES ('one', 1, '9999'), ('other', 1, '9999'), ('two', 2, '9999')");
  const call = async (method: string, path: string, body?: unknown, session = "one") => {
    const res = await app.request(path, {
      method,
      headers: { cookie: `session=${session}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };
  const start = async () => {
    const res = await call("POST", "/api/chatgpt/start");
    const auth = new URL(res.body.url);
    nonce = auth.searchParams.get("nonce")!;
    return `http://127.0.0.1:1455/auth/callback?state=${auth.searchParams.get("state")}&code=private-code&client_id=oaiapp_test`;
  };
  return {
    app,
    call,
    start,
    db,
    store,
    fetches,
    auths,
    revocations,
    refreshes,
    bad: (v: string) => {
      bad = v;
    },
    advance: (milliseconds = 3600001) => {
      now += milliseconds;
    },
    calls: () => tokenCalls,
  };
}
function sse(type: string, response = {}) {
  return new Response(`data: ${JSON.stringify({ type, response })}\n\n`, { headers: { "content-type": "text/event-stream" } });
}

test("manual callback validates ownership, session and single use without fetching the pasted URL", async () => {
  const f = await fixture();
  const callback = await f.start();
  expect((await f.call("POST", "/api/chatgpt/callback", { callback }, "two")).status).toBe(403);
  expect((await f.call("GET", "/api/chatgpt", undefined, "other")).body.signIn).toBe(null);
  expect((await f.call("GET", "/api/chatgpt")).body.signIn).toStartWith("https://auth.openai.com/");
  expect((await f.call("POST", "/api/chatgpt/callback", { callback }, "other")).status).toBe(400);
  expect((await f.call("POST", "/api/chatgpt/callback", { callback })).status).toBe(200);
  expect((await f.call("POST", "/api/chatgpt/callback", { callback })).status).toBe(400);
  expect(f.calls()).toBe(1);
  expect(f.fetches.some((u) => u.includes("127.0.0.1"))).toBe(false);
  expect((await f.call("GET", "/api/chatgpt")).body).toMatchObject({ connected: true, email: "me@example.test" });
  expect((await f.call("GET", "/api/chatgpt")).body.signIn).toBe(null);
  expect((await f.call("GET", "/api/chatgpt", undefined, "two")).status).toBe(403);
  expect((await f.call("POST", "/api/chats", { message: "hi" }, "two")).body.messages.at(-1).content).toBe("Hello");
  expect((await f.call("GET", "/api/ai/status", undefined, "two")).body).toMatchObject({ ai: true, aiSource: "chatgpt", aiProblem: null });
});

test("rejects malformed URLs, mismatched state, expired attempts and denied consent", async () => {
  const f = await fixture();
  const callback = await f.start();
  for (const value of ["invalid", callback.replace("127.0.0.1", "evil.test"), `${callback}&state=duplicate`])
    expect((await f.call("POST", "/api/chatgpt/callback", { callback: value })).body.error).toStartWith("That isn’t the address");
  expect((await f.call("POST", "/api/chatgpt/callback", { callback: callback.replace("state=", "state=wrong") })).body.error).toStartWith("This sign-in attempt has expired");
  expect(f.calls()).toBe(0);
  expect((await f.call("POST", "/api/chatgpt/callback", { callback: callback.replace("code=private-code", "error=access_denied") })).status).toBe(400);
  expect(f.calls()).toBe(0);
  const expired = await f.start();
  f.advance();
  expect((await f.call("POST", "/api/chatgpt/callback", { callback: expired })).status).toBe(400);
});

test("verifies ID token signature, issuer, audience, nonce, expiry and permission scopes", async () => {
  const f = await fixture();
  for (const bad of ["signature", "issuer", "aud", "nonce", "expired", "scope"]) {
    f.bad(bad);
    expect((await f.call("POST", "/api/chatgpt/callback", { callback: await f.start() })).status).toBe(400);
    expect((await f.call("GET", "/api/chatgpt")).body.connected).toBe(false);
  }
});

test("refresh is single flight; revoked credentials give reconnect recovery and disconnect clears them", async () => {
  const f = await fixture();
  await f.call("POST", "/api/chatgpt/callback", { callback: await f.start() });
  f.advance();
  await Promise.all([f.call("GET", "/api/chatgpt/models"), f.call("GET", "/api/chatgpt/models")]);
  expect(f.calls()).toBe(2);
  f.advance();
  f.bad("revoked");
  expect((await f.call("GET", "/api/chatgpt/models")).status).toBe(400);
  expect((await f.call("GET", "/api/chatgpt")).body.needsSignIn).toBe(true);
  expect((await f.call("GET", "/api/ai/status", undefined, "two")).body).toMatchObject({ ai: false, aiSource: "chatgpt", aiProblem: "ChatGPT sign-in has expired. Reconnect ChatGPT in Settings." });
  await f.call("DELETE", "/api/chatgpt");
  expect((await f.call("GET", "/api/chatgpt")).body.connected).toBe(false);
});

test("with ChatGPT connected, a shared key only adds dictation", async () => {
  const f = await fixture();
  await f.call("POST", "/api/chatgpt/callback", { callback: await f.start() });
  expect((await f.call("GET", "/api/ai/status")).body).toMatchObject({ ai: true, vision: true, voice: false });
  f.db.run("UPDATE settings SET ai_base_url = 'https://ai.test/v1', ai_key = 'sk-shared'");
  expect((await f.call("GET", "/api/ai/status")).body).toMatchObject({ ai: true, aiSource: "chatgpt", vision: true, voice: true });
});

test("credentials and host are outside the backup and SQL database", async () => {
  const f = await fixture();
  await f.call("POST", "/api/chatgpt/callback", { callback: await f.start() });
  const bytes = f.db.serialize();
  expect(Buffer.from(bytes).includes(Buffer.from("secret-access"))).toBe(false);
  expect(f.db.query("SELECT name FROM sqlite_schema WHERE name = 'private'").get()).toBe(null);
  expect((await f.call("GET", "/api/ai")).body).not.toHaveProperty("access_token");
});

test("Responses translates images, tools and histories and rejects failed, incomplete and interrupted streams", async () => {
  let sent: any;
  const request = {
    messages: [
      { role: "system", content: "Read receipt" },
      { role: "user", content: [{ type: "image_url", image_url: { url: "data:image/png;base64,eA==" } }] },
      { role: "assistant", tool_calls: [{ id: "c1", function: { name: "transaction", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "c1", content: "{}" },
    ],
    tools: [{ function: { name: "transaction", parameters: {} } }],
    tool_choice: { function: { name: "transaction" } },
  };
  const provider = { key: "private", model: "test" };
  const reply = await responses(
    async (_, init) => {
      sent = JSON.parse(String(init?.body));
      return sse("response.completed", { output: [{ type: "function_call", namespace: "groat", name: "transaction", call_id: "c2", arguments: "{}" }] });
    },
    provider,
    request,
  );
  expect(sent).toMatchObject({
    store: false,
    stream: true,
    tools: [{ type: "namespace", name: "groat" }],
    input: [{ role: "developer" }, { content: [{ type: "input_image" }] }, { type: "function_call", namespace: "groat" }, { type: "function_call_output", call_id: "c1" }],
  });
  expect(reply.tool_calls?.[0].function.name).toBe("transaction");
  for (const type of ["response.failed", "response.incomplete", "error", "response.output_text.delta"])
    await expect(responses(async () => sse(type), provider, request)).rejects.toThrow();
});

test("failed Responses streams log diagnostic fields without private payloads", async () => {
  const log = spyOn(console, "error").mockImplementation(() => {});
  try {
    for (const event of [
      { type: "response.failed", response: { error: { code: "server_error", message: "private-message" }, output: ["private-output"] } },
      { type: "response.incomplete", response: { incomplete_details: { reason: "max_output_tokens" } } },
      { type: "error", code: "rate_limit_exceeded", message: "private-message" },
      { type: "error", code: { secret: "private-object" } },
      { type: "error", code: "private\nforged log" },
      { type: "error", code: "private".repeat(20) },
    ]) {
      log.mockClear();
      const stream = new Response(`data: ${JSON.stringify(event)}\n\n`, { headers: { "x-request-id": "req_test" } });
      await expect(responses(async () => stream, { key: "private-key", model: "test" }, { messages: [{ role: "user", content: "private-prompt" }] })).rejects.toThrow(
        "ChatGPT could not finish this response",
      );
      const code = event.type === "response.failed" ? "server_error" : event.code === "rate_limit_exceeded" ? event.code : undefined;
      expect(log.mock.calls).toHaveLength(1);
      expect(JSON.parse(String(log.mock.calls[0][0]))).toEqual({
        timestamp: expect.any(String), level: "error", event: "ai.response.failed", operation: event.type, providerRequestId: "req_test",
        ...(code && { code }), ...(event.type === "response.incomplete" && { reason: "max_output_tokens" }),
        hasMessage: event.type === "response.failed" || event.code === "rate_limit_exceeded",
      });
      expect(JSON.stringify(log.mock.calls)).not.toContain("private");
    }
  } finally {
    log.mockRestore();
  }
});

test("Responses logs nested errors and message-only failures without exposing messages", async () => {
  const log = spyOn(console, "error").mockImplementation(() => {});
  try {
    for (const [event, expected] of [
      [{ type: "error", error: { code: "insufficient_quota", type: "invalid_request_error", param: "model", message: "private-message" } },
        { code: "insufficient_quota", errorType: "invalid_request_error", param: "model", hasMessage: true }],
      [{ type: "error", code: null, message: "private-message", param: "stream" },
        { param: "stream", hasMessage: true }],
      [{ type: "response.failed", response: { error: { code: "server_error", type: "server_error", message: "private-message" } } },
        { code: "server_error", errorType: "server_error", hasMessage: true }],
      [{ type: "error", error: { code: "private\ncode", type: { secret: "private-type" }, param: "private".repeat(20), message: { secret: "private-message" } } },
        { hasMessage: false }],
    ] as const) {
      log.mockClear();
      const stream = new Response(`data: ${JSON.stringify(event)}\n\n`);
      await expect(responses(async () => stream, { key: "private-key", model: "test" }, { messages: [] })).rejects.toThrow("ChatGPT could not finish");
      expect(log.mock.calls).toHaveLength(1);
      expect(JSON.parse(String(log.mock.calls[0][0]))).toEqual({
        timestamp: expect.any(String), level: "error", event: "ai.response.failed", operation: event.type, ...expected,
      });
      expect(JSON.stringify(log.mock.calls)).not.toContain("private");
    }
  } finally {
    log.mockRestore();
  }
});

test("AI SQL cannot read API keys, session IDs or password hashes", async () => {
  const f = await fixture();
  f.db.run("UPDATE settings SET ai_key = 'sql-private-key', stt_key = 'speech-private-key'");
  const child = Bun.spawn(
    [
      process.execPath,
      `${import.meta.dir}/../server/sql.ts`,
      "SELECT ai_key, stt_key, (SELECT count(*) FROM sessions) AS sessions, (SELECT password_hash FROM users LIMIT 1) AS password FROM settings",
      "200",
    ],
    { stdin: f.db.serialize() },
  );
  const result = await new Response(child.stdout).json();
  expect(await child.exited).toBe(0);
  expect(result.rows[0]).toEqual({ ai_key: null, stt_key: null, sessions: 0, password: "" });
  expect(f.db.query("SELECT ai_key FROM settings").get()).toEqual({ ai_key: "sql-private-key" });
});

test("download excludes private credentials and restore clears existing host and connections", async () => {
  const f = await fixture();
  await f.call("POST", "/api/chatgpt/callback", { callback: await f.start() });
  const host = f.store.query("SELECT value FROM private WHERE key = 'host'").get();
  const backup = await f.app.request("/api/backup", { headers: { cookie: "session=one" } });
  expect(backup.status).toBe(200);
  const bytes = await backup.arrayBuffer();
  expect(Buffer.from(bytes).includes(Buffer.from("secret-access"))).toBe(false);
  expect(Buffer.from(bytes).includes(Buffer.from("urn:uuid:"))).toBe(false);
  const app = createApp({ db: new Database(":memory:"), credentials: f.store, clock: () => new Date(), fetch: async () => new Response("", { status: 404 }) });
  const form = new FormData();
  form.append("backup", new File([bytes], "backup.sqlite"));
  const restored = await app.request("/api/restore", { method: "POST", body: form });
  expect(restored.status).toBe(200);
  expect(f.store.query("SELECT count(*) AS n FROM private").get()).toEqual({ n: 1 });
  expect(f.store.query("SELECT value FROM private WHERE key = 'host'").get()).not.toEqual(host);
});

test("an earlier personal connection becomes the instance's, preferring an admin's", async () => {
  const f = await fixture();
  await f.call("POST", "/api/chatgpt/callback", { callback: await f.start() });
  const row = JSON.parse(f.store.query<{ value: string }, []>("SELECT value FROM private WHERE key = 'instance'").get()!.value);
  f.store.run("DELETE FROM private WHERE key = 'instance'");
  f.db.run("INSERT INTO users (id, username, password_hash, role, deleted_at) VALUES (3, 'gone', 'x', 'admin', '2026-01-01')");
  f.store.run("INSERT INTO private VALUES ('user:3', ?), ('user:2', ?), ('user:1', ?), ('pending:1', '{}')", [
    JSON.stringify({ ...row, access_token: "removed-token" }),
    JSON.stringify({ ...row, access_token: "member-token" }),
    JSON.stringify({ ...row, access_token: "admin-token" }),
  ]);
  const adopted = () => {
    createApp({ db: f.db, credentials: f.store, clock: () => new Date(), fetch: async () => new Response("") });
    return JSON.parse(f.store.query<{ value: string }, []>("SELECT value FROM private WHERE key = 'instance'").get()?.value ?? "null")?.access_token;
  };
  expect(adopted()).toBe("admin-token");
  expect(f.store.query("SELECT count(*) AS n FROM private WHERE key LIKE 'user:%' OR key LIKE 'pending:%'").get()).toEqual({ n: 0 });
  f.store.run("DELETE FROM private WHERE key = 'instance'");
  f.store.run("INSERT INTO private VALUES ('user:3', ?)", [JSON.stringify({ ...row, access_token: "removed-token" })]);
  expect(adopted()).toBe(undefined);
});

test("a capture is kept as pending when the ChatGPT sign-in has expired", async () => {
  const f = await fixture();
  await f.call("POST", "/api/chatgpt/callback", { callback: await f.start() });
  const { token } = (await f.call("POST", "/api/tokens", { name: "Phone" })).body;
  f.advance();
  f.bad("revoked");
  const res = await f.app.request("/api/capture", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ text: "ramen" }) });
  expect(res.status).toBe(201);
  expect(await res.json()).toMatchObject({ note: "ramen", status: "pending" });
});

test("temporary token or JWKS outages preserve a renewable connection", async () => {
  const f = await fixture();
  await f.call("POST", "/api/chatgpt/callback", { callback: await f.start() });
  f.advance();
  f.bad("unavailable");
  expect((await f.call("GET", "/api/chatgpt/models")).status).toBe(400);
  expect((await f.call("GET", "/api/chatgpt")).body.needsSignIn).toBe(false);
  f.bad("");
  expect((await f.call("GET", "/api/chatgpt/models")).status).toBe(200);
});

test("rotated refresh tokens survive a temporary JWKS outage", async () => {
  const f = await fixture();
  await f.call("POST", "/api/chatgpt/callback", { callback: await f.start() });
  f.advance();
  f.bad("jwks");
  expect((await f.call("GET", "/api/chatgpt/models")).status).toBe(400);
  expect((await f.call("GET", "/api/chatgpt")).body.needsSignIn).toBe(false);
  expect(f.calls()).toBe(2);
  f.bad("");
  expect((await f.call("GET", "/api/chatgpt/models")).status).toBe(200);
  expect(f.calls()).toBe(2);
});

test("disconnect revokes the latest token after interrupted refresh validation", async () => {
  const f = await fixture();
  await f.call("POST", "/api/chatgpt/callback", { callback: await f.start() });
  f.advance();
  f.bad("jwks");
  await f.call("GET", "/api/chatgpt/models");
  await f.call("DELETE", "/api/chatgpt");
  expect(f.revocations).toEqual(["secret-refresh-2"]);
  expect((await f.call("GET", "/api/chatgpt")).body.connected).toBe(false);
});

test("tool continuations preserve reasoning and original output items", async () => {
  const items = [
    { type: "reasoning", id: "r1", encrypted_content: "opaque-reasoning", summary: [] },
    { type: "function_call", id: "f1", namespace: "groat", name: "totals", call_id: "c1", arguments: "{}", status: "completed" },
  ];
  const first = { role: "user", content: "What did I spend?" };
  const reply = await responses(async () => sse("response.completed", { output: items }), { key: "secret", model: "test" }, { messages: [first] });
  let sent: any;
  await responses(
    async (_, init) => {
      sent = JSON.parse(String(init?.body));
      return sse("response.completed", { output: [{ type: "message", content: [{ type: "output_text", text: "12" }] }] });
    },
    { key: "secret", model: "test" },
    { messages: [first, reply, { role: "tool", tool_call_id: "c1", content: "12" }] },
  );
  expect(sent.input.slice(1, 3)).toEqual(items);
});

test("opaque model state is not saved in shared chats or returned to members", async () => {
  const f = await fixture();
  await f.call("POST", "/api/chatgpt/callback", { callback: await f.start() });
  f.bad("reasoning");
  const result = await f.call("POST", "/api/chats", { message: "Hello" });
  expect(result.status).toBe(201);
  expect(JSON.stringify(result.body)).not.toContain("opaque-reasoning");
  expect(JSON.stringify(f.db.query("SELECT message FROM chat_messages").all())).not.toContain("opaque-reasoning");
});

test("delayed refresh validation does not extend the access token lifetime", async () => {
  const f = await fixture();
  await f.call("POST", "/api/chatgpt/callback", { callback: await f.start() });
  f.advance();
  f.bad("jwks");
  await f.call("GET", "/api/chatgpt/models");
  f.advance(10 * 60000);
  f.bad("");
  expect((await f.call("GET", "/api/chatgpt/models")).status).toBe(200);
  f.advance(51 * 60000);
  expect((await f.call("GET", "/api/chatgpt/models")).status).toBe(200);
  expect(f.calls()).toBe(3);
});

test("a fresh expense database cannot inherit another installation's connections", async () => {
  const f = await fixture();
  await f.call("POST", "/api/chatgpt/callback", { callback: await f.start() });
  const db = new Database(":memory:");
  const app = createApp({ db, credentials: f.store, clock: () => new Date(), fetch: async () => new Response("", { status: 404 }) });
  db.run("INSERT INTO users (id, username, password_hash, role) VALUES (1, 'new-owner', 'x', 'admin')");
  db.run("INSERT INTO sessions (id, user_id, expires_at) VALUES ('fresh', 1, '9999')");
  const response = await app.request("/api/chatgpt", { headers: { cookie: "session=fresh" } });
  expect((await response.json()).connected).toBe(false);
});

test("refresh recovery uses the latest rotating token after a prolonged JWKS outage", async () => {
  const f = await fixture();
  await f.call("POST", "/api/chatgpt/callback", { callback: await f.start() });
  f.advance();
  f.bad("jwks");
  expect((await f.call("GET", "/api/chatgpt/models")).status).toBe(400);
  f.advance(2 * 3600000);
  f.bad("");
  expect((await f.call("GET", "/api/chatgpt/models")).status).toBe(200);
  expect(f.calls()).toBe(3);
  expect(f.refreshes).toEqual(["secret-refresh-1", "secret-refresh-2"]);
  expect((await f.call("GET", "/api/chatgpt")).body.needsSignIn).toBe(false);
});

test("shared chat history stays readable without an AI connection or after revocation", async () => {
  const f = await fixture();
  await f.call("POST", "/api/chatgpt/callback", { callback: await f.start() });
  const chat = await f.call("POST", "/api/chats", { message: "Shared history" });
  expect(chat.status).toBe(201);
  expect((await f.call("GET", "/api/chats", undefined, "two")).status).toBe(200);
  expect((await f.call("GET", `/api/chats/${chat.body.id}`, undefined, "two")).body).toEqual(chat.body);
  const continued = await f.call("POST", `/api/chats/${chat.body.id}/messages`, { message: "Continue" }, "two");
  expect(continued.status).toBe(200);
  f.advance();
  f.bad("revoked");
  await f.call("GET", "/api/chatgpt/models");
  expect((await f.call("GET", `/api/chats/${chat.body.id}`)).body).toEqual(continued.body);
  expect((await f.call("DELETE", `/api/chats/${chat.body.id}`, undefined, "two")).status).toBe(200);
});
