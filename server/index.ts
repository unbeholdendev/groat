import { chmodSync, closeSync, openSync } from "node:fs";
import { Database } from "bun:sqlite";
import { serveStatic, websocket } from "hono/bun";
import { createApp } from "./app";
import { errorKind, log } from "./logging";

process.once("uncaughtException", (error) => {
  log("error", "process.failed", { error: errorKind(error) });
  process.exit(1);
});
process.once("unhandledRejection", (error) => {
  log("error", "process.rejection", { error: errorKind(error) });
  process.exit(1);
});

const start = performance.now();
const version = process.env.GROAT_VERSION ?? "dev";
log("info", "process.starting", { version: /^[a-zA-Z0-9._+-]{1,80}$/.test(version) ? version : "unknown" });
const ignored = Object.keys(process.env).filter((k) => k.startsWith("AI_"));
if (ignored.length) log("warn", "config.legacy_ai_ignored", { count: ignored.length });

const db = new Database(process.env.DB_PATH ?? "data.db", { create: true });
db.run("PRAGMA journal_mode = WAL");

const credentialPath = `${process.env.DB_PATH ?? "data.db"}.chatgpt`;
closeSync(openSync(credentialPath, "a", 0o600));
chmodSync(credentialPath, 0o600);
const credentials = new Database(credentialPath, { create: true });
const app = createApp({ credentials, db, clock: () => new Date(), fetch });
const timer = setInterval(() => {
  try { app.generate(); } catch (error) { log("error", "background.generate.failed", { error: errorKind(error) }); }
}, 86_400_000);
app.use("*", serveStatic({ root: "./dist" }));
app.get("*", serveStatic({ path: "./dist/index.html" }));

const server = Bun.serve({ port: Number(process.env.PORT ?? 3000), fetch: app.fetch, websocket });
log("info", "process.ready", { port: server.port, durationMs: Math.round(performance.now() - start) });

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  const start = performance.now();
  log("info", "process.shutdown.started", { signal });
  clearInterval(timer);
  app.close();
  const deadline = setTimeout(() => {
    log("error", "process.shutdown.timed_out");
    void server.stop(true);
    process.exit(1);
  }, 10_000);
  await server.stop();
  clearTimeout(deadline);
  db.close();
  credentials.close();
  log("info", "process.shutdown.completed", { durationMs: Math.round(performance.now() - start) });
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
