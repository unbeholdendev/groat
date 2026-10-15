import { expect, test } from "bun:test";
import { setup } from "./harness";

function household() {
  const h = setup();
  const as = async (cookie: string, method: string, path: string, body?: unknown) => {
    const res = await h.app.request(path, { method, headers: { "content-type": "application/json", cookie }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json() };
  };
  const login = async (username: string, password: string) => {
    const res = await h.app.request("/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password }) });
    return res.headers.get("set-cookie")?.split(";")[0] ?? "";
  };
  return { ...h, as, login };
}

test("the admin adds, lists, resets and removes members", async () => {
  const { call, as, login } = household();
  expect((await call("POST", "/api/users", { username: "bob", password: "" })).status).toBe(400);
  const bob = await call("POST", "/api/users", { username: " bob ", password: "pw1" });
  expect(bob).toEqual({ status: 201, body: { id: bob.body.id, username: "bob", role: "member" } });
  expect((await call("POST", "/api/users", { username: "bob", password: "x" })).status).toBe(409);
  expect((await call("GET", "/api/users")).body.map((u: { username: string }) => u.username)).toEqual(["admin", "bob"]);

  const signedIn = await login("bob", "pw1");
  expect(await call("PUT", `/api/users/${bob.body.id}/password`, { password: "pw2" })).toEqual({ status: 200, body: {} });
  expect((await as(signedIn, "GET", "/api/expenses")).status).toBe(401);
  const admin = await login("admin", "secret");
  expect((await as(admin, "PUT", "/api/users/1/password", { password: "new" })).status).toBe(200);
  expect((await as(admin, "GET", "/api/expenses")).status).toBe(200);
  expect(await login("bob", "pw1")).toBe("");
  expect(await login("bob", "pw2")).not.toBe("");

  expect((await call("PUT", "/api/users/99/password", { password: "x" })).status).toBe(404);
});

test("members can't manage the household", async () => {
  const { call, as, login } = household();
  const { body } = await call("POST", "/api/users", { username: "bob", password: "pw" });
  const bob = await login("bob", "pw");
  expect((await as(bob, "GET", "/api/users")).status).toBe(403);
  expect((await as(bob, "POST", "/api/users", { username: "eve", password: "pw" })).status).toBe(403);
  expect((await as(bob, "PUT", "/api/users/1/password", { password: "x" })).status).toBe(403);
  expect((await as(bob, "DELETE", `/api/users/${body.id}`)).status).toBe(403);
});

test("the last admin can't be removed", async () => {
  const { call } = household();
  expect((await call("DELETE", "/api/users/1")).status).toBe(409);
});

test("each expense records who added it; anyone can edit or delete it and the author stays", async () => {
  const { call, as, login } = household();
  await call("POST", "/api/users", { username: "bob", password: "pw" });
  const bob = await login("bob", "pw");
  const mine = await call("POST", "/api/expenses", { note: "Coffee", amount: "3" });
  expect(mine.body.addedBy).toBe("admin");
  const edited = await as(bob, "PUT", `/api/expenses/${mine.body.id}`, { note: "Tea", amount: "2" });
  expect([edited.status, edited.body.note, edited.body.addedBy]).toEqual([200, "Tea", "admin"]);
  const his = await as(bob, "POST", "/api/expenses", { note: "Lunch", amount: "9" });
  expect(his.body.addedBy).toBe("bob");
  expect((await call("DELETE", `/api/expenses/${his.body.id}`)).status).toBe(200);
});

test("removing a member signs them out and keeps their expenses under their name", async () => {
  const { call, as, login } = household();
  const { body } = await call("POST", "/api/users", { username: "bob", password: "pw" });
  const bob = await login("bob", "pw");
  await as(bob, "POST", "/api/expenses", { note: "Lunch", amount: "9" });
  expect(await call("DELETE", `/api/users/${body.id}`)).toEqual({ status: 200, body: {} });
  expect((await as(bob, "GET", "/api/expenses")).status).toBe(401);
  expect(await login("bob", "pw")).toBe("");
  expect((await call("GET", "/api/users")).body.map((u: { username: string }) => u.username)).toEqual(["admin"]);
  expect((await call("GET", "/api/expenses")).body.map((e: { addedBy: string }) => e.addedBy)).toEqual(["bob"]);
});
