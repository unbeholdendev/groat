import { AsyncLocalStorage } from "node:async_hooks";
import type { MiddlewareHandler } from "hono";
import { routePath } from "hono/route";
import type { Deps } from "./app";

const levels = { debug: 10, info: 20, warn: 30, error: 40, silent: 50 };
type Level = Exclude<keyof typeof levels, "silent">;
type Fields = {
  method?: string; route?: string; status?: number; durationMs?: number; operation?: string;
  service?: string; count?: number; error?: string; code?: string; reason?: string;
  errorType?: string; param?: string; hasMessage?: boolean;
  providerRequestId?: string; port?: number; signal?: string; version?: string;
};
const context = new AsyncLocalStorage<{ requestId: string }>();
export type RequestEnv = { Variables: { requestId: string; websocketUpgraded?: boolean } };
const errorNames = new Set(["Error", "TypeError", "SyntaxError", "RangeError", "AbortError", "TimeoutError", "ZodError", "SQLiteError"]);
export const errorKind = (error: unknown) => error instanceof Error && errorNames.has(error.name) ? error.name : "Error";
export const diagnostic = (value: unknown) => typeof value === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(value) ? value : undefined;

export function log(level: Level, event: string, fields: Fields = {}) {
  const configured = process.env.LOG_LEVEL;
  const threshold = configured && Object.hasOwn(levels, configured) ? levels[configured as keyof typeof levels] : levels.info;
  if (levels[level] < threshold) return;
  const line = JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...context.getStore(), ...fields });
  if (level === "warn" || level === "error") console.error(line);
  else console.log(line);
}

export const requestLogging: MiddlewareHandler<RequestEnv> = async (c, next) => {
  const requestId = crypto.randomUUID();
  c.set("requestId", requestId);
  const start = performance.now();
  await context.run({ requestId }, async () => {
    log("debug", "http.request.started", { method: diagnostic(c.req.method) });
    try {
      await next();
    } finally {
      const upgraded = c.get("websocketUpgraded");
      if (!upgraded) c.res.headers.set("x-request-id", requestId);
      const status = upgraded ? 101 : c.res.status;
      log(status >= 500 ? "error" : status >= 400 ? "warn" : "info", "http.request.completed", {
        method: diagnostic(c.req.method), route: routePath(c), status,
        durationMs: Math.round(performance.now() - start), ...(c.error && { error: errorKind(c.error) }),
      });
    }
  });
};

export function loggedFetch(fetch: Deps["fetch"]): Deps["fetch"] {
  return async (input, init) => {
    const start = performance.now();
    const url = new URL(input instanceof Request ? input.url : String(input));
    const service = ({ "auth.openai.com": "chatgpt_auth", "api.openai.com": "openai", "api.frankfurter.dev": "frankfurter", "mempool.space": "mempool", "api.coinbase.com": "coinbase" } as Record<string, string>)[url.hostname] ?? "provider";
    const suffix = url.pathname.split("/").slice(-2).join("/");
    const operation = ({ "chat/completions": "chat_completions", "audio/transcriptions": "transcription", "oauth/token": "oauth_token", "oauth/revoke": "oauth_revoke", ".well-known/jwks.json": "jwks" } as Record<string, string>)[suffix]
      ?? (url.pathname.endsWith("/responses") ? "responses" : url.pathname.endsWith("/models") ? "models" : "fetch");
    log("debug", "http.outbound.started", { service, operation });
    try {
      const response = await fetch(input, init);
      log(response.ok ? "info" : "warn", "http.outbound.response", {
        service, operation, status: response.status, durationMs: Math.round(performance.now() - start),
        providerRequestId: diagnostic(response.headers.get("x-request-id")),
      });
      return response;
    } catch (error) {
      log("warn", "http.outbound.failed", { service, operation, durationMs: Math.round(performance.now() - start), error: errorKind(error) });
      throw error;
    }
  };
}
