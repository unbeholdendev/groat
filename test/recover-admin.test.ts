import { expect, test } from "bun:test";
import { recoverAdmin } from "../server/recover-admin";
import { setup } from "./harness";

test("offline admin recovery resets credentials and revokes only that admin's sessions", async () => {
  const { db, call, app } = setup();
  await call("POST", "/api/users", { username: "bob", password: "pw" });
  db.run("INSERT INTO sessions VALUES ('bob', 2, '9999')");
  await expect(recoverAdmin(db, "bob", "new")).rejects.toThrow("Active admin not found");
  await expect(recoverAdmin(db, "admin", "")).rejects.toThrow("Password must not be empty");
  await recoverAdmin(db, "admin", "new");
  expect(db.query("SELECT id FROM sessions").all()).toEqual([{ id: "bob" }]);
  for (const [password, status] of [
    ["secret", 401],
    ["new", 200],
  ] as const) {
    const res = await app.request("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "admin", password }),
    });
    expect(res.status).toBe(status);
  }
  db.close();
});
