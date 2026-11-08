import { Database } from "bun:sqlite";
import { serveStatic } from "hono/bun";
import { createApp } from "./app";

const db = new Database(process.env.DB_PATH ?? "data.db", { create: true });
db.run("PRAGMA journal_mode = WAL");

const app = createApp({
  db,
  clock: () => new Date(),
  fetch,
  config: {
    aiBaseUrl: process.env.AI_BASE_URL,
    aiApiKey: process.env.AI_API_KEY,
    sttBaseUrl: process.env.AI_STT_BASE_URL,
    sttKey: process.env.AI_STT_KEY,
  },
});
setInterval(app.generate, 86_400_000);
app.use("*", serveStatic({ root: "./dist" }));
app.get("*", serveStatic({ path: "./dist/index.html" }));

export default { port: Number(process.env.PORT ?? 3000), fetch: app.fetch };
