import type { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { chats } from "./ai";
import { attachmentRoutes } from "./attachments";
import { auth, type Env } from "./auth";
import { backupRoutes, restoreRoutes } from "./backup";
import { categoryRoutes } from "./categories";
import { chatgpt } from "./chatgpt";
import { type Db, migrationsFolder } from "./db";
import { draftRoutes } from "./draft";
import { transactionRoutes } from "./transactions";
import { memberRoutes } from "./members";
import { aiModels, type Models } from "./models";
import { exportRoutes } from "./export";
import { importRoutes } from "./import";
import { valuer } from "./rates";
import { recurringRoutes } from "./recurring";
import { settingsRoutes } from "./settings";
import { statsRoutes } from "./stats";
import { captureRoutes, tokenRoutes } from "./tokens";
import { liveUpdates } from "./live";
import { voiceRoutes } from "./voice";
import { errorKind, log, loggedFetch, requestLogging } from "./logging";

export type Deps = {
  db: Database;
  credentials?: Database;
  clock: () => Date;
  fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
};

export type Ctx = Omit<Deps, "db"> & { db: Db; models: Models };

export function createApp(deps: Deps) {
  deps = { ...deps, fetch: loggedFetch(deps.fetch) };
  deps.db.run("PRAGMA foreign_keys = ON");
  const db = drizzle(deps.db, { casing: "snake_case" });
  log("info", "database.migration.started");
  const start = performance.now();
  try {
    migrate(db, { migrationsFolder });
    log("info", "database.migration.completed", { durationMs: Math.round(performance.now() - start) });
  } catch (error) {
    log("error", "database.migration.failed", { error: errorKind(error) });
    throw error;
  }
  const subscription = chatgpt(deps, deps.credentials);
  if (!deps.db.query("SELECT 1 FROM users LIMIT 1").get()) subscription.reset();
  subscription.adopt(deps.db.query<{ id: number }, []>("SELECT id FROM users WHERE deleted_at IS NULL ORDER BY role = 'admin' DESC, id").all().map((u) => u.id));
  const models = aiModels(db, deps.fetch, {
    connected: subscription.connected,
    provider: async () => {
      const saved = await subscription.credential();
      if (!saved) return;
      const model = saved.model ?? (await subscription.catalogue())[0]?.slug;
      if (!model) throw new Error("Choose a ChatGPT model in Settings");
      return { base: "https://api.openai.com/v1", key: saved.access_token, model, responses: true as const };
    },
  });
  const ctx = { ...deps, db, models };
  const app = new Hono<Env>();
  app.use("*", requestLogging);
  app.onError((error, c) => error instanceof HTTPException ? error.getResponse() : c.text("Internal Server Error", 500));
  const value = valuer(ctx);
  const recurring = recurringRoutes(ctx);
  recurring.generate();

  for (const file of ["sw.js", "manifest.webmanifest"])
    app.get(`/${file}`, () => new Response(Bun.file(`${import.meta.dir}/${file}`)));

  const live = liveUpdates(deps.db, deps.clock);
  app.route("/", live.routes);

  app.use("/api/*", async (c, next) => {
    await next();
    c.header("cache-control", "no-store");
    if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method) && c.res.ok) live.publish();
  });

  app.route("/", captureRoutes(ctx));
  app.route("/", restoreRoutes(db, subscription.reset));
  app.route("/", auth(db, deps.clock));
  app.route("/", subscription.routes);
  app.route("/", memberRoutes(db, deps.clock));
  app.route("/", tokenRoutes(ctx));
  app.route("/", models.routes);
  app.route("/", settingsRoutes(db, models));
  app.route("/", categoryRoutes(db));
  app.route("/", transactionRoutes(ctx, value));
  app.route("/", draftRoutes(ctx));
  app.route("/", voiceRoutes(ctx));
  app.route("/", attachmentRoutes(ctx));
  app.route("/", exportRoutes(db, value));
  app.route("/", importRoutes(ctx));
  app.route("/", backupRoutes(db, deps.clock));
  app.route("/", statsRoutes(db, value));
  app.route("/", recurring);
  app.route("/api/chats", chats(ctx, value));
  app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));

  return Object.assign(app, { generate: () => { recurring.generate(); live.publish(); }, close: live.close });
}
