import { onlineManager, type QueryClient } from "@tanstack/react-query";
import { send } from "./api";
import { isLocallySignedOut, lockDevice, unlockDevice } from "./device";
import { session } from "./schemas";

let version = 0;
let ending: Promise<unknown> = Promise.resolve();
const signedIn = session.shape.user.unwrap();

function endSession() {
  ending = fetch("/api/logout", { method: "POST", signal: AbortSignal.timeout(3000) }).catch(() => {});
}

export function endSessionWhenOnline() {
  if (isLocallySignedOut() && onlineManager.isOnline()) endSession();
  onlineManager.subscribe((online) => {
    if (online && isLocallySignedOut()) endSession();
  });
}

export function watchSession(client: QueryClient, owner?: string) {
  const started = version;
  return () => {
    const now = session.safeParse(client.getQueryData(["/api/session"])).data;
    const otherUser = owner !== undefined && (isLocallySignedOut() || (now && now.user?.username !== owner));
    if (version !== started || otherUser)
      throw new Error("Your session changed. Sign in again before retrying this change.");
  };
}

export async function signIn(
  client: QueryClient,
  path: "/api/login" | "/api/setup",
  body: { username: string; password: string },
) {
  await ending;
  const username = body.username.trim();
  const other = client
    .getMutationCache()
    .getAll()
    .find((m) => m.meta?.retained && m.state.status !== "success" && m.meta.owner !== username);
  if (other)
    throw new Error(
      `Unsent changes belong to ${other.meta?.owner ?? "the original user"}. Sign in with that account, or clear unsent changes first.`,
    );
  const current = watchSession(client);
  const user = signedIn.parse(await send("POST", path, body));
  current();
  await client.cancelQueries();
  current();
  await client.resetQueries({
    predicate: (q) =>
      q.queryKey[0] !== "/api/session" && !(q.queryKey[0] === "transaction-draft" && q.queryKey[1] === user.username),
  });
  current();
  unlockDevice();
  client.setQueryData(["/api/session"], { setup: false, user });
  return user;
}

export function signOutDevice(client: QueryClient) {
  endSession();
  return clearDevice(client);
}

export async function clearDevice(client: QueryClient, retainChanges = false) {
  version++;
  if (!retainChanges) lockDevice();
  await client.cancelQueries();
  if (!retainChanges) client.getMutationCache().clear();
  client.removeQueries({ predicate: (q) => q.queryKey[0] !== "/api/session" });
  client.setQueryData(["/api/session"], { setup: false, user: null });
}
