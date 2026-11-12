import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { Deps } from "../../context";

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
export type Credential = z.infer<typeof token> & {
  client: string;
  subject: string;
  email: string;
  expires: number;
  model?: string;
  revoked?: boolean;
  renewal?: z.infer<typeof token> & { receivedAt: number };
};
export type Pending = {
  state: string;
  nonce: string;
  verifier: string;
  session: string;
  expires: number;
  client?: string;
  subject?: string;
  claimed?: boolean;
};
export const random = () => randomBytes(32).toString("base64url");
export const recovery = "ChatGPT sign-in has expired. Reconnect ChatGPT in Settings.";
export const unavailable = "ChatGPT is temporarily unavailable. Try again.";
export const wrongAddress =
  "That isn’t the address of the page that failed to load. Copy its whole address and paste it again.";
export const staleAttempt = "This sign-in attempt has expired. Select Connect ChatGPT to start again.";

export async function exchange(fetch: Deps["fetch"], params: Record<string, string>) {
  const res = await fetch(`${issuer}/api/accounts/oauth/token`, {
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
}

export async function verify(fetch: Deps["fetch"], now: () => number, jwt: string, client: string, nonce?: string) {
  const parts = jwt.split(".");
  if (parts.length !== 3) throw new Error(recovery);
  const header = JSON.parse(Buffer.from(parts[0], "base64url").toString());
  if (header.alg !== "RS256" || typeof header.kid !== "string") throw new Error(recovery);
  const res = await fetch(`${issuer}/.well-known/jwks.json`, { signal: AbortSignal.timeout(5000) });
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
