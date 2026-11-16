import { Database } from "bun:sqlite";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { migrationsFolder } from "../server/db";
import { expect, test } from "bun:test";
import { setup } from "./harness";

test("editing an expense updates its fields", async () => {
  const { call } = setup();
  const { body } = await call("POST", "/api/transactions", { note: "Cofee", amount: "3.20", date: "2026-10-09" });
  const edited = await call("PUT", `/api/transactions/${body.id}`, {
    note: "Coffee",
    amount: "3.50",
    date: "2026-10-08",
  });
  expect(edited.status).toBe(200);
  expect((await call("GET", "/api/transactions")).body).toMatchObject([
    { id: body.id, note: "Coffee", amount: 350, currency: "GBP", date: "2026-10-08", baseAmount: 350 },
  ]);
});

test("deleting moves an expense from the list to the bin", async () => {
  const { call } = setup();
  const keep = await call("POST", "/api/transactions", { note: "Keep", amount: "1", date: "2026-10-09" });
  const gone = await call("POST", "/api/transactions", { note: "Gone", amount: "2", date: "2026-10-09" });
  expect((await call("DELETE", `/api/transactions/${gone.body.id}`)).status).toBe(200);
  expect((await call("PUT", `/api/transactions/${gone.body.id}`, { note: "x", amount: "1" })).status).toBe(404);
  expect((await call("GET", "/api/transactions")).body.map((e: { id: number }) => e.id)).toEqual([keep.body.id]);
  expect((await call("GET", "/api/bin")).body).toMatchObject([
    { id: gone.body.id, note: "Gone", amount: 200, currency: "GBP", date: "2026-10-09" },
  ]);
});

test("restoring returns an expense from the bin to the list", async () => {
  const { call } = setup();
  const { body } = await call("POST", "/api/transactions", { note: "Oops", amount: "4", date: "2026-10-09" });
  await call("DELETE", `/api/transactions/${body.id}`);
  expect((await call("POST", `/api/bin/${body.id}/restore`)).status).toBe(200);
  expect((await call("GET", "/api/bin")).body).toEqual([]);
  expect((await call("GET", "/api/transactions")).body).toMatchObject([
    { id: body.id, note: "Oops", amount: 400, currency: "GBP", date: "2026-10-09", baseAmount: 400 },
  ]);
});

test("emptying the bin removes binned expenses for good and leaves the list alone", async () => {
  const { call } = setup();
  const keep = await call("POST", "/api/transactions", { note: "Keep", amount: "1" });
  const a = await call("POST", "/api/transactions", { note: "A", amount: "2" });
  const b = await call("POST", "/api/transactions", { note: "B", amount: "3" });
  await call("DELETE", `/api/transactions/${a.body.id}`);
  await call("DELETE", `/api/transactions/${b.body.id}`);
  expect((await call("DELETE", "/api/bin")).status).toBe(200);
  expect((await call("GET", "/api/bin")).body).toEqual([]);
  expect((await call("POST", `/api/bin/${a.body.id}/restore`)).status).toBe(404);
  expect((await call("GET", "/api/transactions")).body.map((e: { id: number }) => e.id)).toEqual([keep.body.id]);
});

test("purging an expense deletes it without a trace in the bin", async () => {
  const { call } = setup();
  const { body } = await call("POST", "/api/transactions", { note: "Typo", amount: "2", tags: ["x"] });
  expect((await call("DELETE", `/api/transactions/${body.id}?purge`)).body).toEqual({ id: body.id });
  expect((await call("GET", "/api/transactions")).body).toEqual([]);
  expect((await call("GET", "/api/bin")).body).toEqual([]);
  expect((await call("DELETE", `/api/transactions/${body.id}?purge`)).status).toBe(404);
});

for (const purge of ["one", "bin"] as const) {
  test(`a stale edit cannot overwrite a new expense after purging ${purge}`, async () => {
    const { call, restart } = setup();
    const original = await call("POST", "/api/transactions", { note: "Original", amount: "2" });
    const path = `/api/transactions/${original.body.id}`;
    if (purge === "one") await call("DELETE", `${path}?purge`);
    else {
      await call("DELETE", path);
      await call("DELETE", "/api/bin");
    }
    restart();
    const replacement = await call("POST", "/api/transactions", { note: "Replacement", amount: "3" });
    expect((await call("PUT", path, { note: "Stale edit", amount: "9" })).status).toBe(404);
    expect((await call("GET", "/api/transactions")).body).toMatchObject([
      { id: replacement.body.id, note: "Replacement", amount: 300 },
    ]);
  });
}

for (const foreignKeys of [true, false]) {
  test(`transaction identity migration preserves records with foreign keys ${foreignKeys}`, () => {
    const db = new Database(":memory:");
    db.run(`PRAGMA foreign_keys = ${foreignKeys ? "ON" : "OFF"}`);
    const migrations = readMigrationFiles({ migrationsFolder });
    const upgrade = migrations.findIndex((migration) => migration.folderMillis === 1793998000000);
    expect(upgrade).toBeGreaterThan(0);
    for (const migration of migrations.slice(0, upgrade)) for (const sql of migration.sql) db.run(sql);
    db.run("INSERT INTO users (id, username, password_hash, role) VALUES (1, 'admin', 'hash', 'admin')");
    db.run(`INSERT INTO transactions
      (id, client_request_id, note, amount, currency, date, created_at, updated_at, category_id, created_by)
      VALUES (41, 'request-41', 'Receipt', 250, 'GBP', '2026-10-09', 'then', 'now', 1, 1)`);
    db.run("INSERT INTO tags (id, name) VALUES (3, 'work')");
    db.run("INSERT INTO transaction_tags VALUES (41, 3)");
    db.run("INSERT INTO attachments VALUES (7, 41, 'image/jpeg', X'010203', 'then')");
    db.run("INSERT INTO attachments VALUES (8, NULL, 'image/jpeg', X'0405', 'now')");
    const tables = ["transactions", "attachments", "tags", "transaction_tags"];
    const before = tables.map((table) => db.query(`SELECT * FROM ${table}`).all());
    db.transaction(() => {
      for (const sql of migrations[upgrade].sql) db.run(sql);
    })();
    expect(tables.map((table) => db.query(`SELECT * FROM ${table}`).all())).toEqual(before);
    expect(db.query("PRAGMA foreign_key_check").all()).toEqual([]);
    db.run("DELETE FROM transactions");
    db.run(`INSERT INTO transactions (note, amount, currency, date, created_at, updated_at)
      VALUES ('New', 100, 'GBP', '2026-10-10', 'now', 'now')`);
    expect(db.query("SELECT id FROM transactions").get()).toEqual({ id: 42 });
    db.close();
  });
}
