import type { Database } from "bun:sqlite";
import { z } from "zod";
import type { Deps } from "../../context";
import { errorKind, log } from "../../logging";
import {
  authorizeUrl,
  type Credential,
  exchange,
  type Pending,
  random,
  recovery,
  redirect,
  resource,
  revoke,
  staleAttempt,
  unavailable,
  verify,
  wrongAddress,
} from "./oauth";
import { privateStore } from "./store";

export type ChatGpt = ReturnType<typeof chatgptAccount>;

export function chatgptAccount(deps: Pick<Deps, "fetch" | "clock">, database?: Database) {
  const store = privateStore(database);
  const { read, put, remove } = store;
  let host = read<string>("host") ?? `urn:uuid:${crypto.randomUUID()}`;
  put("host", host);
  const now = () => deps.clock().getTime();
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
                ...(await exchange(deps.fetch, {
                  grant_type: "refresh_token",
                  client_id: saved.client,
                  refresh_token: pending?.refresh_token ?? saved.refresh_token,
                })),
                receivedAt: now(),
              };
        const rotating = read<Credential>("instance");
        if (rotating?.refresh_token !== saved.refresh_token) throw new Error(recovery);
        put("instance", { ...rotating, renewal: fresh });
        const identity = await verify(deps.fetch, now, fresh.id_token, saved.client);
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

  const status = (session: string | undefined) => {
    const saved = read<Credential>("instance");
    const pending = read<Pending>("pending");
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
    const saved = read<Credential>("instance") ?? read<Pick<Credential, "client" | "subject">>("registration");
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
      throw new Error(wrongAddress);
    if (
      !pending ||
      pending.claimed ||
      pending.session !== session ||
      pending.expires <= now() ||
      url.searchParams.get("state") !== pending.state
    )
      throw new Error(staleAttempt);
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
      throw new Error(recovery);
    const fresh = await exchange(deps.fetch, {
      grant_type: "authorization_code",
      client_id: client,
      code,
      code_verifier: pending.verifier,
      redirect_uri: redirect,
    });
    const identity = await verify(deps.fetch, now, fresh.id_token, client, pending.nonce);
    if (pending.subject && pending.subject !== identity.subject) throw new Error(recovery);
    if (read<Pending>("pending")?.state !== pending.state || pending.expires <= now()) throw new Error(staleAttempt);
    remove("pending");
    put("registration", { client, subject: identity.subject });
    put("instance", { ...fresh, ...identity, client, expires: now() + fresh.expires_in * 1000 });
    log("info", "chatgpt.connected");
    return true;
  };

  const chooseModel = async (model: string) => {
    if (!(await catalogue()).some((m) => m.slug === model)) throw new Error(recovery);
    const saved = await credential();
    if (!saved) throw new Error(recovery);
    put("instance", { ...saved, model });
  };

  const disconnect = async () => {
    const saved = read<Credential>("instance");
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
    pending: () => read<Pending>("pending"),
    startSignIn,
    finishSignIn,
    cancelSignIn: () => remove("pending"),
    chooseModel,
    disconnect,
    connected: () => !!read("instance"),
    adopt: store.adopt,
    reset: () => {
      store.clear();
      host = `urn:uuid:${crypto.randomUUID()}`;
      put("host", host);
    },
  };
}
