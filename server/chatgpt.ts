import { Database } from "bun:sqlite";
import { createHash, randomBytes } from "node:crypto";
import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { z } from "zod";
import type { Deps } from "./app";
import { admin, type Env } from "./auth";
import { errorKind, log } from "./logging";

const issuer = "https://auth.openai.com";
const resource = "https://api.openai.com/v1";
const redirect = "http://127.0.0.1:1455/auth/callback";
const scopes = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
const token = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  id_token: z.string().min(1),
  token_type: z.literal("Bearer"),
  expires_in: z.number().positive(),
  scope: z.string(),
});
type Credential = z.infer<typeof token> & {
  client: string;
  subject: string;
  email: string;
  expires: number;
  model?: string;
  revoked?: boolean;
  renewal?: z.infer<typeof token> & { receivedAt: number };
};
type Pending = {
  state: string;
  nonce: string;
  verifier: string;
  session: string;
  expires: number;
  client?: string;
  subject?: string;
  claimed?: boolean;
};
const random = () => randomBytes(32).toString("base64url");
const recovery = "ChatGPT sign-in has expired. Reconnect ChatGPT in Settings.";
const unavailable = "ChatGPT is temporarily unavailable. Try again.";
const wrongAddress =
  "That isn’t the address of the page that failed to load. Copy its whole address and paste it again.";
const staleAttempt = "This sign-in attempt has expired. Select Connect ChatGPT to start again.";

export function chatgpt(deps: Pick<Deps, "fetch" | "clock">, store = new Database(":memory:")) {
  store.run("PRAGMA secure_delete = ON");
  store.run("CREATE TABLE IF NOT EXISTS private (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  const read = <T>(key: string) => {
    const row = store.query<{ value: string }, [string]>("SELECT value FROM private WHERE key = ?").get(key);
    return row ? (JSON.parse(row.value) as T) : undefined;
  };
  const put = (key: string, value: unknown) =>
    store.run("INSERT OR REPLACE INTO private VALUES (?, ?)", [key, JSON.stringify(value)]);
  const remove = (key: string) => store.run("DELETE FROM private WHERE key = ?", [key]);
  let host = read<string>("host") ?? `urn:uuid:${crypto.randomUUID()}`;
  put("host", host);
  const now = () => deps.clock().getTime();
  const exchange = async (params: Record<string, string>) => {
    const res = await deps.fetch(`${issuer}/api/accounts/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ resource, ...params }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const error = (await res.json().catch(() => null)) as { error?: string | { code?: string } } | null;
      const code = typeof error?.error === "string" ? error.error : error?.error?.code;
      const terminal = [
        "invalid_grant",
        "invalid_refresh_token",
        "token_expired",
        "refresh_token_expired",
        "refresh_token_invalidated",
        "refresh_token_reused",
      ].includes(code ?? "");
      throw Object.assign(new Error(terminal ? recovery : unavailable), { terminal });
    }
    const parsed = token.safeParse(await res.json());
    if (!parsed.success || !scopes.split(" ").every((s) => parsed.data.scope.split(" ").includes(s)))
      throw new Error(recovery);
    return parsed.data;
  };
  const verify = async (jwt: string, client: string, nonce?: string) => {
    const parts = jwt.split(".");
    if (parts.length !== 3) throw new Error(recovery);
    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString());
    if (header.alg !== "RS256" || typeof header.kid !== "string") throw new Error(recovery);
    const res = await deps.fetch(`${issuer}/.well-known/jwks.json`, { signal: AbortSignal.timeout(5000) });
    const jwks = (await res.json()) as { keys: (JsonWebKey & { kid: string })[] };
    const jwk = jwks.keys.find((k) => k.kid === header.kid && k.kty === "RSA");
    if (!jwk) throw new Error(recovery);
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, [
      "verify",
    ]);
    if (
      !(await crypto.subtle.verify(
        "RSASSA-PKCS1-v1_5",
        key,
        Buffer.from(parts[2], "base64url"),
        Buffer.from(`${parts[0]}.${parts[1]}`),
      ))
    )
      throw new Error(recovery);
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (
      claims.iss !== issuer ||
      !audience.includes(client) ||
      (claims.azp !== undefined && claims.azp !== client) ||
      (audience.length > 1 && claims.azp !== client) ||
      typeof claims.exp !== "number" ||
      claims.exp * 1000 <= now() ||
      (claims.nbf && claims.nbf * 1000 > now()) ||
      typeof claims.sub !== "string" ||
      !claims.sub ||
      (nonce && claims.nonce !== nonce)
    )
      throw new Error(recovery);
    return { subject: String(claims.sub), email: typeof claims.email === "string" ? claims.email : String(claims.sub) };
  };
  let flight: Promise<Credential> | undefined;
  const credential = async (): Promise<Credential | undefined> => {
    const saved = read<Credential>("instance");
    if (!saved) return;
    if (saved.revoked) throw new Error(recovery);
    if (!saved.renewal && saved.expires > now() + 60000) return saved;
    if (flight) return flight;
    flight = (async () => {
      log("debug", "chatgpt.refresh.started");
      try {
        const pending = saved.renewal;
        const fresh =
          pending && pending.receivedAt + pending.expires_in * 1000 > now() + 60000
            ? pending
            : {
                ...(await exchange({
                  grant_type: "refresh_token",
                  client_id: saved.client,
                  refresh_token: pending?.refresh_token ?? saved.refresh_token,
                })),
                receivedAt: now(),
              };
        const rotating = read<Credential>("instance");
        if (rotating?.refresh_token !== saved.refresh_token) throw new Error(recovery);
        put("instance", { ...rotating, renewal: fresh });
        const identity = await verify(fresh.id_token, saved.client);
        if (identity.subject !== saved.subject) throw new Error(recovery);
        const current = read<Credential>("instance");
        if (current?.refresh_token !== saved.refresh_token) throw new Error(recovery);
        const { receivedAt, ...tokens } = fresh;
        const updated = { ...current, ...tokens, renewal: undefined, expires: receivedAt + fresh.expires_in * 1000 };
        put("instance", updated);
        log("info", "chatgpt.refresh.completed");
        return updated;
      } catch (error) {
        if (
          error instanceof Error &&
          "terminal" in error &&
          error.terminal &&
          read<Credential>("instance")?.refresh_token === saved.refresh_token
        )
          put("instance", { ...saved, revoked: true });
        log("warn", "chatgpt.refresh.failed", {
          error: errorKind(error),
          code: read<Credential>("instance")?.revoked ? "revoked" : "retryable",
        });
        throw error;
      }
    })();
    try {
      return await flight;
    } finally {
      flight = undefined;
    }
  };
  const catalogue = async () => {
    const saved = await credential();
    if (!saved) return [];
    const res = await deps.fetch(`${resource}/models`, {
      headers: { authorization: `Bearer ${saved.access_token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 401 || res.status === 403) throw new Error(recovery);
    if (!res.ok) throw new Error(unavailable);
    return z
      .object({ models: z.array(z.object({ slug: z.string(), display_name: z.string(), visibility: z.string() })) })
      .parse(await res.json())
      .models.filter((m) => m.visibility === "list");
  };
  const authorize = (pending: Pending) => {
    const url = new URL(`${issuer}/api/accounts/authorize`);
    url.search = new URLSearchParams({
      client_id: pending.client ?? "dynamic_agent_client",
      ...(!pending.client && { agent_name_hint: "Groat" }),
      ext_agent_host_id: host,
      response_type: "code",
      redirect_uri: redirect,
      scope: scopes,
      resource,
      state: pending.state,
      nonce: pending.nonce,
      code_challenge_method: "S256",
      code_challenge: createHash("sha256").update(pending.verifier).digest("base64url"),
    }).toString();
    return url.href;
  };
  const known = new Set([recovery, unavailable, wrongAddress, staleAttempt]);
  const routes = new Hono<Env>();
  routes.use("/api/chatgpt", admin);
  routes.use("/api/chatgpt/*", admin);
  routes.onError((e, c) => c.json({ error: known.has(e.message) ? e.message : unavailable }, 400));
  routes.get("/api/chatgpt", (c) => {
    const saved = read<Credential>("instance");
    const pending = read<Pending>("pending");
    const waiting =
      pending && !pending.claimed && pending.expires > now() && pending.session === getCookie(c, "session");
    return c.json({
      connected: !!saved,
      email: saved?.email ?? null,
      model: saved?.model ?? null,
      needsSignIn: !!saved?.revoked,
      signIn: waiting ? authorize(pending) : null,
    });
  });
  routes.post("/api/chatgpt/start", (c) => {
    const saved = read<Credential>("instance") ?? read<Pick<Credential, "client" | "subject">>("registration");
    const pending: Pending = {
      state: random(),
      nonce: random(),
      verifier: random(),
      session: getCookie(c, "session")!,
      expires: now() + 600000,
      client: saved?.client,
      subject: saved?.subject,
    };
    put("pending", pending);
    return c.json({ url: authorize(pending) });
  });
  routes.delete("/api/chatgpt/start", (c) => {
    remove("pending");
    return c.json({});
  });
  routes.post("/api/chatgpt/callback", async (c) => {
    const pending = read<Pending>("pending");
    const input = z.object({ callback: z.string().max(16384) }).parse(await c.req.json());
    const url = URL.parse(input.callback.trim());
    if (
      !url ||
      url.origin + url.pathname !== redirect ||
      url.hash ||
      url.username ||
      url.password ||
      [...url.searchParams.keys()].some((k) => url.searchParams.getAll(k).length !== 1)
    )
      throw new Error(wrongAddress);
    if (
      !pending ||
      pending.claimed ||
      pending.session !== getCookie(c, "session") ||
      pending.expires <= now() ||
      url.searchParams.get("state") !== pending.state
    )
      throw new Error(staleAttempt);
    put("pending", { ...pending, claimed: true });
    if (url.searchParams.has("error")) {
      remove("pending");
      return c.json({ error: "ChatGPT connection was declined. You can try again." }, 400);
    }
    const client = url.searchParams.get("client_id") ?? pending.client;
    const code = url.searchParams.get("code");
    if (
      !client ||
      client === "dynamic_agent_client" ||
      !/^oaiapp_[A-Za-z0-9_-]+$/.test(client) ||
      (pending.client && pending.client !== client) ||
      !code
    )
      throw new Error(recovery);
    const fresh = await exchange({
      grant_type: "authorization_code",
      client_id: client,
      code,
      code_verifier: pending.verifier,
      redirect_uri: redirect,
    });
    const identity = await verify(fresh.id_token, client, pending.nonce);
    if (pending.subject && pending.subject !== identity.subject) throw new Error(recovery);
    if (read<Pending>("pending")?.state !== pending.state || pending.expires <= now()) throw new Error(staleAttempt);
    remove("pending");
    put("registration", { client, subject: identity.subject });
    put("instance", { ...fresh, ...identity, client, expires: now() + fresh.expires_in * 1000 });
    log("info", "chatgpt.connected");
    return c.json({ connected: true });
  });
  routes.get("/api/chatgpt/models", async (c) => c.json({ models: await catalogue() }));
  routes.put("/api/chatgpt/model", async (c) => {
    const { model } = z.object({ model: z.string() }).parse(await c.req.json());
    if (!(await catalogue()).some((m) => m.slug === model)) throw new Error(recovery);
    const saved = await credential();
    if (!saved) throw new Error(recovery);
    put("instance", { ...saved, model });
    return c.json({});
  });
  routes.delete("/api/chatgpt", async (c) => {
    const saved = read<Credential>("instance");
    remove("instance");
    remove("pending");
    const revoked = saved
      ? await deps
          .fetch(`${issuer}/api/accounts/oauth/revoke`, {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              token: saved.renewal?.refresh_token ?? saved.refresh_token,
              token_type_hint: "refresh_token",
              client_id: saved.client,
            }),
            signal: AbortSignal.timeout(5000),
          })
          .then((r) => r.ok)
          .catch(() => false)
      : true;
    log(revoked ? "info" : "warn", "chatgpt.disconnected", { code: revoked ? "revoked" : "revocation_unconfirmed" });
    return c.json({ revocationConfirmed: revoked });
  });
  return {
    routes,
    credential,
    catalogue,
    connected: () => !!read("instance"),
    adopt: (preferred: number[]) => {
      if (read("instance")) return;
      const user = preferred.find((u) => read(`user:${u}`));
      if (user !== undefined) {
        put("instance", read(`user:${user}`));
        const registration = read(`registration:${user}`);
        if (registration) put("registration", registration);
      }
      store.run("DELETE FROM private WHERE key LIKE 'user:%' OR key LIKE 'registration:%' OR key LIKE 'pending:%'");
    },
    reset: () => {
      store.run("DELETE FROM private");
      host = `urn:uuid:${crypto.randomUUID()}`;
      put("host", host);
    },
  };
}
