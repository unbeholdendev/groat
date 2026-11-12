import type { Database } from "bun:sqlite";
import { z } from "zod";
import type { Deps } from "../../context";
import { errorKind, log } from "../../logging";
import {
  authorizeUrl,
  type Credential,
  credentialRecord,
  exchange,
  type Pending,
  pendingRecord,
  random,
  recovery,
  redirect,
  resource,
  revoke,
  staleAttempt,
  unavailable,
  unreachable,
  verify,
  wrongAddress,
} from "./oauth";
import { fail } from "../../request";
import { privateStore } from "./store";

export type ChatGpt = ReturnType<typeof chatgptAccount>;

const catalogueReply = z.object({
  models: z.array(z.object({ slug: z.string(), display_name: z.string(), visibility: z.string() })),
});

export function chatgptAccount(deps: Pick<Deps, "fetch" | "clock">, database?: Database) {
  const store = privateStore(database);
  const { read, put, remove } = store;
  let host = read("host", z.string()) ?? `urn:uuid:${crypto.randomUUID()}`;
  put("host", host);
  const now = () => deps.clock().getTime();
  const instance = () => read("instance", credentialRecord);
  const attempt = () => read("pending", pendingRecord);
  let flight: Promise<Credential> | undefined;
  const credential = async (): Promise<Credential | undefined> => {
    const saved = instance();
    if (!saved) return;
    if (saved.revoked) fail(400, recovery);
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
                ...(await exchange(deps.fetch, {
                  grant_type: "refresh_token",
                  client_id: saved.client,
                  refresh_token: pending?.refresh_token ?? saved.refresh_token,
                })),
                receivedAt: now(),
              };
        const rotating = instance();
        if (rotating?.refresh_token !== saved.refresh_token) fail(400, recovery);
        put("instance", { ...rotating, renewal: fresh });
        const identity = await verify(deps.fetch, now, fresh.id_token, saved.client);
        if (identity.subject !== saved.subject) fail(400, recovery);
        const current = instance();
        if (current?.refresh_token !== saved.refresh_token) fail(400, recovery);
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
          instance()?.refresh_token === saved.refresh_token
        )
          put("instance", { ...saved, revoked: true });
        log("warn", "chatgpt.refresh.failed", {
          error: errorKind(error),
          code: instance()?.revoked ? "revoked" : "retryable",
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
    const res = await deps
      .fetch(`${resource}/models`, {
        headers: { authorization: `Bearer ${saved.access_token}` },
        signal: AbortSignal.timeout(10000),
      })
      .catch(unreachable);
    if (res.status === 401 || res.status === 403) fail(400, recovery);
    if (!res.ok) fail(400, unavailable);
    const listed = catalogueReply.safeParse(await res.json().catch(unreachable));
    if (!listed.success) fail(400, unavailable);
    return listed.data.models.filter((m) => m.visibility === "list");
  };

  const status = (session: string | undefined) => {
    const saved = instance();
    const pending = attempt();
    const waiting = pending && !pending.claimed && pending.expires > now() && pending.session === session;
    return {
      connected: !!saved,
      email: saved?.email ?? null,
      model: saved?.model ?? null,
      needsSignIn: !!saved?.revoked,
      signIn: waiting ? authorizeUrl(host, pending) : null,
    };
  };

  const startSignIn = (session: string) => {
    const saved = instance() ?? read("registration", credentialRecord.pick({ client: true, subject: true }));
    const pending: Pending = {
      state: random(),
      nonce: random(),
      verifier: random(),
      session,
      expires: now() + 600000,
      client: saved?.client,
      subject: saved?.subject,
    };
    put("pending", pending);
    return authorizeUrl(host, pending);
  };

  const finishSignIn = async (pending: Pending | undefined, callback: string, session: string | undefined) => {
    const url = URL.parse(callback.trim());
    if (
      !url ||
      url.origin + url.pathname !== redirect ||
      url.hash ||
      url.username ||
      url.password ||
      [...url.searchParams.keys()].some((k) => url.searchParams.getAll(k).length !== 1)
    )
      fail(400, wrongAddress);
    if (
      !pending ||
      pending.claimed ||
      pending.session !== session ||
      pending.expires <= now() ||
      url.searchParams.get("state") !== pending.state
    )
      fail(400, staleAttempt);
    put("pending", { ...pending, claimed: true });
    if (url.searchParams.has("error")) {
      remove("pending");
      return false;
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
      fail(400, recovery);
    const fresh = await exchange(deps.fetch, {
      grant_type: "authorization_code",
      client_id: client,
      code,
      code_verifier: pending.verifier,
      redirect_uri: redirect,
    });
    const identity = await verify(deps.fetch, now, fresh.id_token, client, pending.nonce);
    if (pending.subject && pending.subject !== identity.subject) fail(400, recovery);
    if (attempt()?.state !== pending.state || pending.expires <= now()) fail(400, staleAttempt);
    remove("pending");
    put("registration", { client, subject: identity.subject });
    put("instance", { ...fresh, ...identity, client, expires: now() + fresh.expires_in * 1000 });
    log("info", "chatgpt.connected");
    return true;
  };

  const chooseModel = async (model: string) => {
    if (!(await catalogue()).some((m) => m.slug === model)) fail(400, recovery);
    const saved = await credential();
    if (!saved) fail(400, recovery);
    put("instance", { ...saved, model });
  };

  const disconnect = async () => {
    const saved = instance();
    remove("instance");
    remove("pending");
    const revoked = saved ? await revoke(deps.fetch, saved) : true;
    log(revoked ? "info" : "warn", "chatgpt.disconnected", { code: revoked ? "revoked" : "revocation_unconfirmed" });
    return revoked;
  };

  return {
    credential,
    catalogue,
    status,
    pending: () => attempt(),
    startSignIn,
    finishSignIn,
    cancelSignIn: () => remove("pending"),
    chooseModel,
    disconnect,
    connected: () => !!instance(),
    adopt: store.adopt,
    reset: () => {
      store.clear();
      host = `urn:uuid:${crypto.randomUUID()}`;
      put("host", host);
    },
  };
}
