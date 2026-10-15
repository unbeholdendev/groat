import type { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { Hono } from "hono";
import { chats } from "./ai";
import { auth } from "./auth";
import { categoryRoutes } from "./categories";
import type { Db } from "./db";
import { expenseRoutes } from "./expenses";
import { exportRoutes } from "./export";
import { rateRoutes, valuer } from "./rates";
import { recurringRoutes } from "./recurring";
import { settingsRoutes } from "./settings";
import { statsRoutes } from "./stats";

export type Deps = {
  db: Database;
  clock: () => Date;
  fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  config: { aiBaseUrl?: string; aiApiKey?: string; aiModel?: string };
};

export type Ctx = Omit<Deps, "db"> & { db: Db };

export function createApp(deps: Deps) {
  deps.db.run("PRAGMA foreign_keys = ON");
  const db = drizzle(deps.db, { casing: "snake_case" });
  migrate(db, { migrationsFolder: `${import.meta.dir}/drizzle` });
  const ctx = { ...deps, db };
  const app = new Hono();
  const value = valuer(ctx);
  const recurring = recurringRoutes(ctx);
  recurring.generate();

  for (const file of ["sw.js", "manifest.webmanifest"])
    app.get(`/${file}`, () => new Response(Bun.file(`${import.meta.dir}/${file}`)));

  app.use("/api/*", async (c, next) => {
    await next();
    c.header("cache-control", "no-store");
  });

  app.route("/", auth(db, deps.clock));
  app.route("/", settingsRoutes(db, deps.config));
  app.route("/", categoryRoutes(db));
  app.route("/", expenseRoutes(ctx, value));
  app.route("/", exportRoutes(db, value));
  app.route("/", statsRoutes(db, value));
  app.route("/", rateRoutes(db));
  app.route("/", recurring);
  app.route("/api/chats", chats(ctx, value));
  app.all("/api/*", (c) => c.json({ error: "not found" }, 404));

  return Object.assign(app, { generate: recurring.generate });
}
