import { createHash, randomBytes } from "node:crypto";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Deps } from "../../context";
import { fail } from "../../request";

const issuer = "https://auth.openai.com";
export const resource = "https://api.openai.com/v1";
export const redirect = "http://127.0.0.1:1455/auth/callback";
const scopes = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
const token = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  id_token: z.string().min(1),
  token_type: z.literal("Bearer"),
  expires_in: z.number().positive(),
  scope: z.string(),
});
export const credentialRecord = token.extend({
  client: z.string(),
  subject: z.string(),
  email: z.string(),
  expires: z.number(),
  model: z.string().optional(),
  revoked: z.boolean().optional(),
  renewal: token.extend({ receivedAt: z.number() }).optional(),
});
export type Credential = z.infer<typeof credentialRecord>;
export const pendingRecord = z.object({
  state: z.string(),
  nonce: z.string(),
  verifier: z.string(),
  session: z.string(),
  expires: z.number(),
  client: z.string().optional(),
  subject: z.string().optional(),
  claimed: z.boolean().optional(),
});
export type Pending = z.infer<typeof pendingRecord>;
const rejection = z.object({ error: z.union([z.string(), z.object({ code: z.string().optional() })]) });
const keySet = z.object({ keys: z.array(z.looseObject({ kid: z.string(), kty: z.string() })) });
export const random = () => randomBytes(32).toString("base64url");
export const recovery = "ChatGPT sign-in has expired. Reconnect ChatGPT in Settings.";
export const unavailable = "ChatGPT is temporarily unavailable. Try again.";
export const wrongAddress =
  "That isn’t the address of the page that failed to load. Copy its whole address and paste it again.";
export const staleAttempt = "This sign-in attempt has expired. Select Connect ChatGPT to start again.";
export const unreachable = () => fail(400, unavailable);

const header = z.object({ alg: z.literal("RS256"), kid: z.string() });
const segment = (part: string): unknown => {
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString());
  } catch {
    return undefined;
  }
};

export async function exchange(fetch: Deps["fetch"], params: Record<string, string>) {
  const res = await fetch(`${issuer}/api/accounts/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ resource, ...params }),
    signal: AbortSignal.timeout(15000),
  }).catch(unreachable);
  if (!res.ok) {
    const error = rejection.safeParse(await res.json().catch(() => null)).data?.error;
    const code = typeof error === "string" ? error : error?.code;
    const terminal = [
      "invalid_grant",
      "invalid_refresh_token",
      "token_expired",
      "refresh_token_expired",
      "refresh_token_invalidated",
      "refresh_token_reused",
    ].includes(code ?? "");
    throw Object.assign(new HTTPException(400, { message: terminal ? recovery : unavailable }), { terminal });
  }
  const parsed = token.safeParse(await res.json().catch(unreachable));
  if (!parsed.success || !scopes.split(" ").every((s) => parsed.data.scope.split(" ").includes(s))) fail(400, recovery);
  return parsed.data;
}

export async function verify(fetch: Deps["fetch"], now: () => number, jwt: string, client: string, nonce?: string) {
  const parts = jwt.split(".");
  if (parts.length !== 3) fail(400, recovery);
  const head = header.safeParse(segment(parts[0]));
  if (!head.success) fail(400, recovery);
  const res = await fetch(`${issuer}/.well-known/jwks.json`, { signal: AbortSignal.timeout(5000) }).catch(unreachable);
  if (!res.ok) fail(400, unavailable);
  const jwks = keySet.safeParse(await res.json().catch(unreachable));
  if (!jwks.success) fail(400, unavailable);
  const jwk = jwks.data.keys.find((k) => k.kid === head.data.kid && k.kty === "RSA");
  if (!jwk) fail(400, recovery);
  const key = await crypto.subtle
    .importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"])
    .catch(unreachable);
  if (
    !(await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      Buffer.from(parts[2], "base64url"),
      Buffer.from(`${parts[0]}.${parts[1]}`),
    ))
  )
    fail(400, recovery);
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
    fail(400, recovery);
  return { subject: String(claims.sub), email: typeof claims.email === "string" ? claims.email : String(claims.sub) };
}

export function authorizeUrl(host: string, pending: Pending) {
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
}

export const revoke = (fetch: Deps["fetch"], saved: Credential) =>
  fetch(`${issuer}/api/accounts/oauth/revoke`, {
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
    .catch(() => false);
