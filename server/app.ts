import type { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { AsyncLocalStorage } from "node:async_hooks";
import { Hono } from "hono";
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
import { rateRoutes, valuer } from "./rates";
import { recurringRoutes } from "./recurring";
import { settingsRoutes } from "./settings";
import { statsRoutes } from "./stats";
import { captureRoutes, tokenRoutes } from "./tokens";
import { voiceRoutes } from "./voice";

export type Deps = {
  db: Database;
  credentials?: Database;
  clock: () => Date;
  fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
};

export type Ctx = Omit<Deps, "db"> & { db: Db; models: Models };

export function createApp(deps: Deps) {
  deps.db.run("PRAGMA foreign_keys = ON");
  const db = drizzle(deps.db, { casing: "snake_case" });
  migrate(db, { migrationsFolder });
  const personal = chatgpt(deps, deps.credentials);
  if (!deps.db.query("SELECT 1 FROM users LIMIT 1").get()) personal.reset();
  const actor = new AsyncLocalStorage<number>();
  const models = aiModels(db, deps.fetch, async () => {
    const user = actor.getStore();
    if (user === undefined) return;
    const saved = await personal.credential(user);
    if (!saved) return;
    const model = saved.model ?? (await personal.catalogue(user))[0]?.slug;
    if (!model) throw new Error("Choose a ChatGPT model in Settings");
    return { base: "https://api.openai.com/v1", key: saved.access_token, model, responses: true as const };
  });
  const ctx = { ...deps, db, models };
  const app = new Hono<Env>();
  const value = valuer(ctx);
  const recurring = recurringRoutes(ctx);
  recurring.generate();

  for (const file of ["sw.js", "manifest.webmanifest"])
    app.get(`/${file}`, () => new Response(Bun.file(`${import.meta.dir}/${file}`)));

  app.use("/api/*", async (c, next) => {
    await next();
    c.header("cache-control", "no-store");
  });

  app.route("/", captureRoutes(ctx));
  app.route("/", restoreRoutes(db, personal.reset));
  app.route("/", auth(db, deps.clock));
  app.use("/api/*", async (c, next) => {
    const user = c.get("user");
    await actor.run(user.id, next);
  });
  app.route("/", personal.routes);
  app.route("/", memberRoutes(db, deps.clock));
  app.route("/", tokenRoutes(ctx));
  app.route("/", models.routes);
  app.route("/", settingsRoutes(db, models));
  app.route("/", categoryRoutes(db));
  app.route("/", rateRoutes(ctx, value));
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

  return Object.assign(app, { generate: recurring.generate });
}
