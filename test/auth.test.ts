import { expect, test } from "bun:test";
import { setup } from "./harness";

function anonymous() {
  const h = setup();
  const post = (path: string, body?: unknown, cookie = "") =>
    h.app.request(path, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(body ?? {}) });
  const get = (path: string, cookie = "") => h.app.request(path, { headers: { cookie } });
  const session = (res: Response) => res.headers.get("set-cookie")!.split(";")[0];
  return { ...h, post, get, session };
}

test("a fresh install asks for setup, which creates the admin and signs them in, then closes", async () => {
  const { db, post, get, session } = anonymous();
  db.run("DELETE FROM users");
  expect(await (await get("/api/session")).json()).toEqual({ setup: true, user: null });
  expect((await get("/api/settings")).status).toBe(401);
  expect((await post("/api/setup", { username: " ann ", password: "" })).status).toBe(400);

  const res = await post("/api/setup", { username: " ann ", password: "hunter22" });
  expect(res.status).toBe(201);
  expect(res.headers.get("set-cookie")).toContain("HttpOnly");
  expect(res.headers.get("set-cookie")).toContain("SameSite=Lax");
  expect(await (await get("/api/session", session(res))).json()).toEqual({ setup: false, user: { username: "ann", role: "admin" } });
  expect((await get("/api/settings", session(res))).status).toBe(200);

  expect((await post("/api/setup", { username: "bob", password: "x" })).status).toBe(409);
});

test("an upgraded install keeps its data after setup, added by the admin", async () => {
  const { db, call, post, get, session } = anonymous();
  await call("POST", "/api/onboarding", { baseCurrency: "GBP", currencies: ["GBP"] });
  await call("POST", "/api/expenses", { note: "Coffee", amount: "3" });
  db.run("UPDATE expenses SET created_by = NULL");
  db.run("DELETE FROM sessions");
  db.run("DELETE FROM users");
  const res = await post("/api/setup", { username: "ann", password: "hunter22" });
  const rows: { note: string; addedBy: string }[] = await (await get("/api/expenses", session(res))).json();
  expect(rows.map((e) => [e.note, e.addedBy])).toEqual([["Coffee", "ann"]]);
});

test("login takes a good password and refuses a bad one", async () => {
  const { post, get, session } = anonymous();
  expect((await post("/api/login", { username: "admin", password: "wrong" })).status).toBe(401);
  expect((await post("/api/login", { username: "nobody", password: "secret" })).status).toBe(401);
  const res = await post("/api/login", { username: "admin", password: "secret" });
  expect(res.status).toBe(200);
  expect((await get("/api/expenses", session(res))).status).toBe(200);
});

test("cookies are Secure over HTTPS", async () => {
  const { app } = anonymous();
  const res = await app.request("https://example.com/api/login", {
    method: "POST",
    body: JSON.stringify({ username: "admin", password: "secret" }),
  });
  expect(res.headers.get("set-cookie")).toContain("Secure");
});

test("sessions slide forward with use and expire when idle", async () => {
  const { clock, post, get, session } = anonymous();
  const cookie = session(await post("/api/login", { username: "admin", password: "secret" }));
  clock.now = new Date("2026-11-05T12:00:00Z");
  expect((await get("/api/expenses", cookie)).status).toBe(200);
  clock.now = new Date("2026-12-01T12:00:00Z");
  expect((await get("/api/expenses", cookie)).status).toBe(200);
  clock.now = new Date("2027-01-01T12:00:00Z");
  expect((await get("/api/expenses", cookie)).status).toBe(401);
});

test("logout ends the session", async () => {
  const { post, get, session } = anonymous();
  const cookie = session(await post("/api/login", { username: "admin", password: "secret" }));
  expect((await post("/api/logout", {}, cookie)).status).toBe(200);
  expect((await get("/api/expenses", cookie)).status).toBe(401);
  expect(await (await get("/api/session", cookie)).json()).toEqual({ setup: false, user: null });
});

test("without a session the API refuses everything else", async () => {
  const { get, post } = anonymous();
  for (const path of ["/api/expenses", "/api/categories", "/api/stats", "/api/export", "/api/chats", "/api/nope"])
    expect((await get(path)).status).toBe(401);
  expect((await post("/api/expenses", { note: "x", amount: "1" })).status).toBe(401);
  expect((await post("/api/logout")).status).toBe(401);
  expect((await get("/api/expenses", "session=forged")).status).toBe(401);
});
