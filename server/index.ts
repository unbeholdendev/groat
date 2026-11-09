import { chmodSync, closeSync, openSync } from "node:fs";
import { Database } from "bun:sqlite";
import { serveStatic, websocket } from "hono/bun";
import { createApp } from "./app";

const ignored = Object.keys(process.env).filter((k) => k.startsWith("AI_"));
if (ignored.length) console.warn(`Groat ignores ${ignored.join(", ")}. Set up AI in Settings instead.`);

const db = new Database(process.env.DB_PATH ?? "data.db", { create: true });
db.run("PRAGMA journal_mode = WAL");

const credentialPath = `${process.env.DB_PATH ?? "data.db"}.chatgpt`;
closeSync(openSync(credentialPath, "a", 0o600));
chmodSync(credentialPath, 0o600);
const app = createApp({
  credentials: new Database(credentialPath, { create: true }),
  db,
  clock: () => new Date(),
  fetch,
});
setInterval(app.generate, 86_400_000);
app.use("*", serveStatic({ root: "./dist" }));
app.get("*", serveStatic({ path: "./dist/index.html" }));

export default { port: Number(process.env.PORT ?? 3000), fetch: app.fetch, websocket };
