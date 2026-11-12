import { Database } from "bun:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "./auth";
import { type Db, migrationsFolder, today } from "./db";
import { valid } from "./request";
import { log } from "./logging";

const scrubbed = ["sessions", "api_tokens", "chat_messages", "chats"];
const notBackup = "That file isn’t a backup from this app";
const upload = z.object({ backup: z.file() });

const temp = async () => join(await mkdtemp(join(tmpdir(), "transaction-backup-")), "backup.sqlite");
const remove = (path: string) => rm(dirname(path), { recursive: true, force: true });
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

export function backupRoutes(db: Db, clock: () => Date) {
  const app = new Hono<Env>();

  app.get("/api/backup", async (c) => {
    if (c.get("user").role !== "admin") return c.json({ error: "Only admins can do that" }, 403);
    const path = await temp();
    try {
      db.$client.run("VACUUM INTO ?", [path]);
      const copy = new Database(path);
      copy.run("PRAGMA journal_mode = DELETE");
      for (const table of scrubbed) copy.run(`DELETE FROM ${table}`);
      copy.run("UPDATE settings SET ai_base_url = NULL, ai_key = NULL, stt_base_url = NULL, stt_key = NULL");
      // Without this the deleted session ids and AI keys would survive in free pages.
      copy.run("VACUUM");
      copy.close();
      const bytes = await Bun.file(path).bytes();
      log("info", "backup.completed");
      return c.body(bytes, 200, {
        "content-type": "application/vnd.sqlite3",
        "content-disposition": `attachment; filename="expenses-${today(clock)}.sqlite"`,
      });
    } finally {
      await remove(path);
    }
  });

  return app;
}

function prepare(path: string) {
  const known = new Set(readMigrationFiles({ migrationsFolder }).map((m) => m.folderMillis));
  let file: Database | undefined;
  try {
    file = new Database(path, { readwrite: true });
    const integrity = file.query("PRAGMA integrity_check").values();
    if (integrity.length !== 1 || integrity[0][0] !== "ok") return "That backup is damaged";
    const applied = file.query("SELECT created_at FROM __drizzle_migrations").values();
    if (!applied.length || !file.query("SELECT 1 FROM settings").get()) return notBackup;
    if (applied.some(([at]) => !known.has(Number(at))))
      return "This backup is from a newer version of the app. Update the app, then restore.";
    file.run("PRAGMA journal_mode = DELETE");
    migrate(drizzle(file), { migrationsFolder });
  } catch {
    return notBackup;
  } finally {
    file?.close();
  }
}

export function restoreRoutes(db: Db, resetCredentials: () => void = () => {}) {
  const app = new Hono();
  const live = db.$client;
  const fresh = () => !live.query("SELECT 1 FROM users UNION ALL SELECT 1 FROM transactions").get();
  const used = "Restore only works on a new instance, before anyone signs up";

  app.post("/api/restore", async (c) => {
    if (!fresh()) return c.json({ error: used }, 409);
    const parsed = valid(upload, await c.req.parseBody().catch(() => undefined));
    if ("error" in parsed) return c.json({ error: "Choose a backup file" }, 400);
    const path = await temp();
    try {
      await Bun.write(path, parsed.data.backup);
      const problem = prepare(path);
      if (problem) return c.json({ error: problem }, 400);
      if (!fresh()) return c.json({ error: used }, 409);
      const tables = live
        .query(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '__drizzle_migrations'",
        )
        .values()
        .map(([name]) => String(name));
      live.run("ATTACH ? AS backup", [path]);
      try {
        live.transaction(() => {
          live.run("PRAGMA defer_foreign_keys = ON");
          for (const table of tables) live.run(`DELETE FROM main.${quote(table)}`);
          for (const table of tables) {
            const columns = live
              .query("SELECT name FROM pragma_table_info(?)")
              .values(table)
              .map(([name]) => quote(String(name)))
              .join(", ");
            live.run(`INSERT INTO main.${quote(table)} (${columns}) SELECT ${columns} FROM backup.${quote(table)}`);
          }
        })();
      } catch {
        return c.json({ error: notBackup }, 400);
      } finally {
        live.run("DETACH backup");
      }
      resetCredentials();
      log("info", "restore.completed");
      return c.json({});
    } finally {
      await remove(path);
    }
  });

  return app;
}
