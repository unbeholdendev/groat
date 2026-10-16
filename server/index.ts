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
    aiModel: process.env.AI_MODEL,
    aiVisionModel: process.env.AI_VISION_MODEL,
    sttBaseUrl: process.env.AI_STT_BASE_URL,
    sttKey: process.env.AI_STT_KEY,
    sttModel: process.env.AI_STT_MODEL,
  },
});
setInterval(app.generate, 86_400_000);
app.use("*", serveStatic({ root: "./dist" }));
app.get("*", serveStatic({ path: "./dist/index.html" }));

export default { port: Number(process.env.PORT ?? 3000), fetch: app.fetch };
