import { Hono } from "hono";
import { z } from "zod";
import { knownCurrencies } from "../shared/amount";
import { aiEnabled, visionModel } from "./ai";
import type { Deps } from "./app";
import { type Db, settings as stored } from "./db";
import { body } from "./request";
import { voiceEnabled } from "./voice";
import * as t from "./schema";

const defaultCategories: [string, string, string, [string, string][]?][] = [
  ["Food", "🍽️", "#f98942", [["Groceries", "🛒"], ["Eating out", "🍜"]]],
  ["Transport", "🚗", "#26c0cf", [["Fuel", "⛽"], ["Public transport", "🚆"], ["Taxi", "🚕"]]],
  ["Home", "🏠", "#3fbe90", [["Rent/Mortgage", "🔑"], ["Utilities", "💡"], ["Maintenance", "🧰"]]],
  ["Subscriptions", "📺", "#bf73df"],
  ["Health", "💊", "#f16f7e"],
  ["Shopping", "🛍️", "#e977bb"],
  ["Entertainment", "🎬", "#f4bf3f"],
  ["Travel", "✈️", "#99d352"],
  ["Gifts", "🎁", "#e977bb"],
];

const currency = z.string("Invalid currency").refine((c) => knownCurrencies.has(c), "Invalid currency");
const onboarding = z.object({ baseCurrency: currency });
const update = onboarding.extend({ theme: z.enum(["system", "light", "dark"], "Invalid theme") }).partial();

export function settingsRoutes(db: Db, config: Deps["config"]) {
  const app = new Hono();
  const cat = t.categories;
  const settings = () => ({ ...stored(db), ai: aiEnabled(config), vision: !!visionModel(config), voice: voiceEnabled(config) });

  app.get("/api/settings", (c) => c.json(settings()));

  app.put("/api/settings", async (c) => {
    const input = await body(c, update);
    if ("error" in input) return c.json(input, 400);
    const { baseCurrency, theme } = { ...settings(), ...input.data };
    db.update(t.settings).set({ baseCurrency, theme }).run();
    return c.json(settings());
  });

  app.post("/api/onboarding", async (c) => {
    if (settings().onboarded) return c.json({ error: "Setup is already done" }, 409);
    const input = await body(c, onboarding);
    if ("error" in input) return c.json(input, 400);
    db.transaction(() => {
      db.update(t.settings).set({ ...input.data, onboarded: true }).run();
      defaultCategories.forEach(([name, icon, color, children = []], i) => {
        const { id } = db.insert(cat).values({ name, icon, color, sort: i }).returning({ id: cat.id }).get();
        children.forEach(([child, childIcon], j) => db.insert(cat).values({ name: child, icon: childIcon, color, parentId: id, sort: j }).run());
      });
    });
    return c.json(settings());
  });

  return app;
}
