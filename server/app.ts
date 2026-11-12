import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { chatRoutes } from "./ai/chat/routes";
import { chatgptAccount } from "./ai/chatgpt/account";
import { chatgptRoutes } from "./ai/chatgpt/routes";
import { draftRoutes } from "./ai/draft-routes";
import { modelRoutes } from "./ai/model-routes";
import { aiModels } from "./ai/models";
import { voiceRoutes } from "./ai/voice";
import type { Env } from "./auth/access";
import { memberRoutes } from "./auth/members";
import { authRoutes } from "./auth/routes";
import { backupRoutes, restoreRoutes } from "./backup";
import { categoryRoutes } from "./categories/routes";
import type { Ctx, Deps } from "./context";
import { migrationsFolder } from "./db";
import { liveUpdates } from "./live";
import { errorKind, log, loggedFetch, requestLogging } from "./logging";
import { valuer } from "./rates/valuer";
import { settingsRoutes } from "./settings/routes";
import { statsRoutes } from "./stats/routes";
import { tagRoutes } from "./tags/routes";
import { captureRoutes } from "./tokens/capture";
import { tokenRoutes } from "./tokens/routes";
import { attachmentRoutes } from "./transactions/attachments";
import { exportRoutes } from "./transactions/export";
import { importRoutes } from "./transactions/import-routes";
import { generateRecurring } from "./transactions/recurring";
import { recurringRoutes } from "./transactions/recurring-routes";
import { transactionRoutes } from "./transactions/routes";

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
  const chatgpt = chatgptAccount(deps, deps.credentials);
  if (!deps.db.query("SELECT 1 FROM users LIMIT 1").get()) chatgpt.reset();
  chatgpt.adopt(
    deps.db
      .query<{ id: number }, []>("SELECT id FROM users WHERE deleted_at IS NULL ORDER BY role = 'admin' DESC, id")
      .all()
      .map((u) => u.id),
  );
  const ai = aiModels({ db, fetch: deps.fetch, chatgpt });
  const live = liveUpdates(deps);
  const value = valuer({ db, fetch: deps.fetch, clock: deps.clock });
  const ctx: Ctx = {
    ...deps,
    db,
    ai,
    chatgpt,
    value,
    publishChanges: live.publishChanges,
    broadcast: live.broadcast,
  };
  const app = new Hono<Env>();
  app.use("*", requestLogging);
  app.onError((error, c) =>
    error instanceof HTTPException ? error.getResponse() : c.text("Internal Server Error", 500),
  );
  generateRecurring(ctx);

  for (const file of ["sw.js", "manifest.webmanifest"])
    app.get(`/${file}`, () => new Response(Bun.file(`${import.meta.dir}/${file}`)));

  app.route("/", live.routes);

  app.use("/api/*", async (c, next) => {
    await next();
    c.header("cache-control", "no-store");
  });
  app.use("/api/*", live.publishChanges);

  app.route("/", captureRoutes(ctx));
  app.route("/", restoreRoutes(ctx));
  app.route("/", authRoutes(ctx));
  app.route("/", chatgptRoutes(ctx));
  app.route("/", memberRoutes(ctx));
  app.route("/", tokenRoutes(ctx));
  app.route("/", modelRoutes(ctx));
  app.route("/", settingsRoutes(ctx));
  app.route("/", categoryRoutes(ctx));
  app.route("/", tagRoutes(ctx));
  app.route("/", transactionRoutes(ctx));
  app.route("/", draftRoutes(ctx));
  app.route("/", voiceRoutes(ctx));
  app.route("/", attachmentRoutes(ctx));
  app.route("/", exportRoutes(ctx));
  app.route("/", importRoutes(ctx));
  app.route("/", backupRoutes(ctx));
  app.route("/", statsRoutes(ctx));
  app.route("/", recurringRoutes(ctx));
  app.route("/api/chats", chatRoutes(ctx));
  app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));

  return Object.assign(app, {
    generate: () => {
      generateRecurring(ctx);
      live.publish(["recurring", "transactions"]);
    },
    close: live.close,
  });
}
