import { createECDH, randomBytes } from "node:crypto";
import { expect, test } from "bun:test";
import { setup } from "./harness";

function device(endpoint = "https://fcm.googleapis.com/fcm/send/device-1") {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return { endpoint, keys: { p256dh: ecdh.getPublicKey("base64url"), auth: randomBytes(16).toString("base64url") } };
}

function pushService(status = 201) {
  const sent: { url: string; headers: Headers }[] = [];
  const handler = (url: URL, init?: RequestInit) => {
    if (url.host !== "fcm.googleapis.com") return;
    sent.push({ url: url.href, headers: new Headers(init?.headers) });
    return new Response(null, { status });
  };
  return { handler, sent };
}

const evening = { time: "20:00", timeZone: "Europe/Vilnius" };

test("a device gets one reminder a day at its local time", async () => {
  const push = pushService();
  const s = setup("2026-10-10T12:00:00Z", push.handler);
  const subscription = device();
  expect((await s.call("PUT", "/api/reminders", { subscription, ...evening })).status).toBe(200);

  s.clock.now = new Date("2026-10-10T16:59:00Z");
  await s.app.remind();
  expect(push.sent).toHaveLength(0);

  s.clock.now = new Date("2026-10-10T17:00:00Z");
  await s.app.remind();
  expect(push.sent).toHaveLength(1);
  expect(push.sent[0].url).toBe(subscription.endpoint);
  expect(push.sent[0].headers.get("content-encoding")).toBe("aes128gcm");
  expect(push.sent[0].headers.get("authorization")).toStartWith("vapid t=");

  s.clock.now = new Date("2026-10-10T20:30:00Z");
  await s.app.remind();
  expect(push.sent).toHaveLength(1);

  s.clock.now = new Date("2026-10-11T17:00:00Z");
  await s.app.remind();
  expect(push.sent).toHaveLength(2);
});

test("a reminder set after today's time starts tomorrow", async () => {
  const push = pushService();
  const s = setup("2026-10-10T18:00:00Z", push.handler);
  await s.call("PUT", "/api/reminders", { subscription: device(), ...evening });
  await s.app.remind();
  expect(push.sent).toHaveLength(0);
  s.clock.now = new Date("2026-10-11T17:00:00Z");
  await s.app.remind();
  expect(push.sent).toHaveLength(1);
});

test("devices list with a stable key, change time and switch off", async () => {
  const s = setup();
  const subscription = device();
  const { publicKey } = (await s.call("GET", "/api/reminders")).body;
  expect(publicKey).toMatch(/^[\w-]{87}$/);
  await s.call("PUT", "/api/reminders", { subscription, ...evening });
  await s.call("PUT", "/api/reminders", { subscription, ...evening, time: "21:15" });
  expect((await s.call("GET", "/api/reminders")).body).toEqual({
    publicKey,
    reminders: [{ endpoint: subscription.endpoint, time: "21:15" }],
  });
  expect((await s.call("DELETE", "/api/reminders", { endpoint: subscription.endpoint })).status).toBe(200);
  expect((await s.call("GET", "/api/reminders")).body).toEqual({ publicKey, reminders: [] });
});

test("a subscription the push service has dropped is forgotten", async () => {
  const push = pushService(410);
  const s = setup("2026-10-10T12:00:00Z", push.handler);
  await s.call("PUT", "/api/reminders", { subscription: device(), ...evening });
  s.clock.now = new Date("2026-10-10T17:00:00Z");
  await s.app.remind();
  expect(push.sent).toHaveLength(1);
  expect((await s.call("GET", "/api/reminders")).body.reminders).toEqual([]);
});

test("reminders reject bad input", async () => {
  const s = setup();
  for (const body of [
    { subscription: device("http://fcm.googleapis.com/fcm/send/plain"), ...evening },
    { subscription: device("https://internal.lan/hook"), ...evening },
    { subscription: device("https://fcm.googleapis.com.evil.test/x"), ...evening },
    { subscription: device(), ...evening, time: "25:00" },
    { subscription: device(), ...evening, timeZone: "Mars/Olympus" },
    { ...evening },
  ])
    expect((await s.call("PUT", "/api/reminders", body)).status).toBe(400);
});

test("removing a member removes their reminders", async () => {
  const push = pushService();
  const s = setup("2026-10-10T12:00:00Z", push.handler);
  const bob = await s.call("POST", "/api/users", { username: "bob", password: "pw1" });
  await s.call("PUT", "/api/reminders", { subscription: device(), ...evening });
  s.db.run("UPDATE reminders SET user_id = ?", [bob.body.id]);
  await s.call("DELETE", `/api/users/${bob.body.id}`);
  s.clock.now = new Date("2026-10-10T17:00:00Z");
  await s.app.remind();
  expect(push.sent).toHaveLength(0);
});

test("reminders go only to known push services and do not follow redirects", async () => {
  const redirects: (string | undefined)[] = [];
  const s = setup("2026-10-10T12:00:00Z", (_, init) => {
    redirects.push(init?.redirect);
    return new Response(null, { status: 201 });
  });
  for (const endpoint of [
    "https://updates.push.services.mozilla.com/wpush/v2/a",
    "https://web.push.apple.com/b",
    "https://wns2-par02p.notify.windows.com/w/?token=c",
  ])
    expect((await s.call("PUT", "/api/reminders", { subscription: device(endpoint), ...evening })).status).toBe(200);
  s.clock.now = new Date("2026-10-10T17:00:00Z");
  await s.app.remind();
  expect(redirects).toEqual(["manual", "manual", "manual"]);
});
