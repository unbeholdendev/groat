import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { migrationsFolder } from "../server/db";
import { frankfurter, setup } from "./harness";

const kept = ["transactions", "settings", "categories", "category_order", "rates", "tags", "transaction_tags", "recurring", "users", "attachments"];
const dump = (db: Database, table: string) => db.query(`SELECT * FROM ${table} ORDER BY rowid`).all();

function fresh() {
  const h = setup("2026-10-10T12:00:00Z", frankfurter({ "2026-10-01": { EUR: 0.9, GBP: 0.8 } }));
  h.db.run("DELETE FROM users");
  const restore = async (bytes: Uint8Array<ArrayBuffer> | string) => {
    const form = new FormData();
    form.append("backup", new File([bytes], "backup.sqlite"));
    const res = await h.app.request("/api/restore", { method: "POST", body: form });
    return { status: res.status, body: await res.json() };
  };
  const login = (username: string, password: string) =>
    h.app.request("/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password }) });
  return { ...h, restore, login };
}

async function household() {
  const h = setup("2026-10-10T12:00:00Z", frankfurter({ "2026-10-01": { EUR: 0.9, GBP: 0.8 } }));
  const { call, db } = h;
  await call("POST", "/api/onboarding", { baseCurrency: "GBP" });
  await call("POST", "/api/users", { username: "bob", password: "pw" });
  const lunch = await call("POST", "/api/transactions", { note: "Lunch", amount: "12.50", currency: "EUR", tags: ["work"] });
  const binned = await call("POST", "/api/transactions", { note: "Oops", amount: "1", currency: "GBP" });
  await call("DELETE", `/api/transactions/${binned.body.id}`);
  await call("POST", "/api/recurring", { note: "Power", amount: "60", period: "month", every: 1, startDate: "2026-10-01", needsConfirmation: true });
  await call("POST", "/api/tokens", { name: "phone" });
  db.run("INSERT INTO attachments (transaction_id, mime, bytes, created_at) VALUES (?, 'image/png', ?, '2026-10-10')", [lunch.body.id, new Uint8Array([1, 2, 3, 0, 255])]);
  db.run("INSERT INTO chats (title) VALUES ('Spending')");
  db.run("INSERT INTO chat_messages (chat_id, message) VALUES (1, '\"hi\"')");
  db.run("INSERT INTO sessions (id, user_id, expires_at) VALUES ('live-session-6f1c2', 1, '9999')");
  return h;
}

const download = async (h: Awaited<ReturnType<typeof household>>) => {
  const res = await h.request("/api/backup");
  expect(res.status).toBe(200);
  expect(res.headers.get("content-disposition")).toBe('attachment; filename="expenses-2026-10-10.sqlite"');
  return new Uint8Array(await res.arrayBuffer());
};

const tempFile = (bytes: Uint8Array) => {
  const path = `${mkdtempSync(`${tmpdir()}/backup-test-`)}/backup.sqlite`;
  writeFileSync(path, bytes);
  return path;
};

test("a backup restores into a fresh instance with its financial data and accounts", async () => {
  const source = await household();
  const bytes = await download(source);
  expect(Buffer.from(bytes).includes("live-session-6f1c2")).toBe(false);

  const target = fresh();
  expect(await target.restore(bytes)).toEqual({ status: 200, body: {} });
  for (const table of kept) expect([table, dump(target.db, table)]).toEqual([table, dump(source.db, table)]);
  for (const table of ["sessions", "api_tokens", "chats", "chat_messages"]) expect(dump(target.db, table)).toEqual([]);
  expect(dump(target.db, "transactions").length).toBe(3);

  expect((await target.login("admin", "secret")).status).toBe(200);
  expect((await target.login("bob", "pw")).status).toBe(200);
  const image = await target.request("/api/attachments/1");
  expect(new Uint8Array(await image.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 0, 255]));
});

test("only admins can download a backup", async () => {
  const h = await household();
  const cookie = (await h.app.request("/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "bob", password: "pw" }) }))
    .headers.get("set-cookie")!.split(";")[0];
  expect((await h.app.request("/api/backup", { headers: { cookie } })).status).toBe(403);
  expect((await h.app.request("/api/backup")).status).toBe(401);
});

test("restore is refused once the instance has an account or expenses", async () => {
  const bytes = await download(await household());
  const used = setup();
  const form = new FormData();
  form.append("backup", new File([bytes], "backup.sqlite"));
  expect((await used.app.request("/api/restore", { method: "POST", body: form })).status).toBe(409);

  const legacy = fresh();
  legacy.db.run("INSERT INTO transactions (note, amount, currency, date, created_at, updated_at) VALUES ('Old', 1, 'GBP', '2026-01-01', '', '')");
  expect((await legacy.restore(bytes)).status).toBe(409);
  expect(dump(legacy.db, "transactions").length).toBe(1);
});

test("a file that isn't a backup fails clearly and leaves the instance fresh", async () => {
  const target = fresh();
  const plain = new Database(tempFile(new Uint8Array()));
  plain.run("CREATE TABLE notes (text TEXT)");
  plain.close();
  for (const bytes of ["not a database", new Uint8Array(), readFileSync(plain.filename)]) {
    const res = await target.restore(bytes);
    expect(res).toEqual({ status: 400, body: { error: "That file isn’t a backup from this app" } });
  }
  expect((await (await target.app.request("/api/session")).json()).setup).toBe(true);
});

test("a damaged backup is refused", async () => {
  const bytes = await download(await household());
  bytes.fill(7, 4096, 8192);
  const res = await fresh().restore(bytes);
  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/damaged|isn’t a backup/);
});

test("a backup from a newer version is refused", async () => {
  const path = tempFile(await download(await household()));
  const db = new Database(path);
  db.run("INSERT INTO __drizzle_migrations (hash, created_at) VALUES ('future', 99999999999999)");
  db.close();
  const target = fresh();
  expect(await target.restore(readFileSync(path))).toEqual({ status: 400, body: { error: "This backup is from a newer version of the app. Update the app, then restore." } });
  expect(dump(target.db, "users")).toEqual([]);
});

test.skipIf(readMigrationFiles({ migrationsFolder }).length < 2)("a backup from an older version is migrated forward", async () => {
  const folder = mkdtempSync(`${tmpdir()}/migrations-`);
  cpSync(`${import.meta.dir}/../server/drizzle`, folder, { recursive: true });
  const journal = JSON.parse(readFileSync(`${folder}/meta/_journal.json`, "utf8"));
  writeFileSync(`${folder}/meta/_journal.json`, JSON.stringify({ ...journal, entries: journal.entries.slice(0, -1) }));
  const old = new Database(tempFile(new Uint8Array()));
  migrate(drizzle(old), { migrationsFolder: folder });
  old.run("INSERT INTO users (username, password_hash, role) VALUES ('admin', ?, 'admin')", [Bun.password.hashSync("old", { algorithm: "argon2id", memoryCost: 8, timeCost: 1 })]);
  old.close();

  const target = fresh();
  expect((await target.restore(readFileSync(old.filename))).status).toBe(200);
  expect((await target.login("admin", "old")).status).toBe(200);
});
