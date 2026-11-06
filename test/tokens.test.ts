import { expect, test } from "bun:test";
import { setup } from "./harness";

async function withToken() {
  const h = setup();
  const created = await h.call("POST", "/api/tokens", { name: "Phone" });
  const token: string = created.body.token;
  const capture = async (text: unknown, bearer = token) => {
    const res = await h.app.request("/api/capture", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${bearer}` },
      body: JSON.stringify({ text }),
    });
    return { status: res.status, body: await res.json() };
  };
  return { ...h, created, token, capture };
}

test("a token is shown once, listed without its secret, and revoked", async () => {
  const { call, db, created, token } = await withToken();
  expect(created.status).toBe(201);
  expect(token).toStartWith("et_");
  expect(created.body).toMatchObject({ name: "Phone", createdAt: "2026-10-10T12:00:00.000Z", lastUsedAt: null });
  expect(JSON.stringify(db.query("SELECT * FROM api_tokens").all())).not.toContain(token);

  const list = await call("GET", "/api/tokens");
  expect(list.body).toEqual([{ id: created.body.id, name: "Phone", createdAt: "2026-10-10T12:00:00.000Z", lastUsedAt: null }]);

  expect((await call("POST", "/api/tokens", { name: " " })).status).toBe(400);
  expect((await call("DELETE", `/api/tokens/${created.body.id}`)).status).toBe(200);
  expect((await call("GET", "/api/tokens")).body).toEqual([]);
  expect((await call("DELETE", `/api/tokens/${created.body.id}`)).status).toBe(404);
});

test("confident text saves an expense and marks the token used", async () => {
  const { call, capture } = await withToken();
  const food = (await call("POST", "/api/categories", { name: "Food", icon: "x", color: "#f00" })).body;
  await call("POST", "/api/transactions", { note: "Coffee", amount: "3", categoryId: food.id });

  const res = await capture("coffee 4.50 #work");
  expect(res.status).toBe(201);
  expect(res.body).toMatchObject({ note: "coffee", amount: 450, categoryId: food.id, status: "normal", tags: ["work"], addedBy: "admin" });
  expect((await call("GET", "/api/tokens")).body[0].lastUsedAt).toBe("2026-10-10T12:00:00.000Z");
});

test("a guessed currency no longer offered falls back instead of failing", async () => {
  const { call, db, capture } = await withToken();
  const { body } = await call("POST", "/api/transactions", { note: "Croissant", amount: "2" });
  db.run("UPDATE transactions SET currency = 'ADP' WHERE id = ?", [body.id]);
  await call("POST", "/api/transactions", { note: "Tea", amount: "1", currency: "GBP" });

  expect((await capture("croissant 3")).body).toMatchObject({ note: "croissant", amount: 300, currency: "GBP" });
});

test("unsure text waits as pending until confirmed", async () => {
  const { call, capture } = await withToken();

  const guessless = await capture("parking 6");
  expect(guessless.body).toMatchObject({ note: "parking", amount: 600, status: "pending" });

  const amountless = await capture("lunch with sam");
  expect(amountless.body).toMatchObject({ note: "lunch with sam", amount: 0, status: "pending" });

  expect((await call("GET", "/api/transactions?status=pending")).body.map((e: { note: string }) => e.note)).toEqual(["lunch with sam", "parking"]);
  expect((await call("POST", `/api/transactions/${guessless.body.id}/confirm`)).body.status).toBe("normal");
  expect((await capture("")).status).toBe(400);
});

test("a revoked or unknown token is refused, and tokens only open capture", async () => {
  const { app, call, created, token, capture } = await withToken();
  expect((await capture("tea 2", "et_nope")).status).toBe(401);
  expect((await app.request("/api/transactions", { headers: { authorization: `Bearer ${token}` } })).status).toBe(401);
  await call("DELETE", `/api/tokens/${created.body.id}`);
  expect((await capture("tea 2")).status).toBe(401);
});

test("a member's capture is theirs, and removing the member revokes their tokens", async () => {
  const { app, call, capture } = await withToken();
  const bob = (await call("POST", "/api/users", { username: "bob", password: "pw" })).body;
  const login = await app.request("/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "bob", password: "pw" }) });
  const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
  const res = await app.request("/api/tokens", { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ name: "Bob's phone" }) });
  const { token } = await res.json();

  expect((await capture("tea 2", token)).body).toMatchObject({ addedBy: "bob", status: "pending" });
  await call("DELETE", `/api/users/${bob.id}`);
  expect((await capture("tea 2", token)).status).toBe(401);
});
