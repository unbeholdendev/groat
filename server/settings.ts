import { Hono } from "hono";
import { aiEnabled } from "./ai";
import type { Deps } from "./app";
import { type Db, settings as stored } from "./db";
import { knownCurrencies } from "./rates";
import { json } from "./request";
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

function shortlist(base: unknown, list: unknown) {
  if (!Array.isArray(list) || !list.every((c) => knownCurrencies.has(c)) || !knownCurrencies.has(base as string))
    return null;
  return [...new Set([base as string, ...list])];
}

export function settingsRoutes(db: Db, config: Deps["config"]) {
  const app = new Hono();
  const cat = t.categories;
  const settings = () => ({ ...stored(db), ai: aiEnabled(config) });

  app.get("/api/settings", (c) => c.json(settings()));

  app.put("/api/settings", async (c) => {
    const { baseCurrency, currencies, theme } = { ...settings(), ...(await json(c)) };
    const list = shortlist(baseCurrency, currencies);
    if (!list) return c.json({ error: "invalid currencies" }, 400);
    if (!["system", "light", "dark"].includes(theme)) return c.json({ error: "invalid theme" }, 400);
    db.update(t.settings).set({ baseCurrency, currencies: list, theme }).run();
    return c.json(settings());
  });

  app.post("/api/onboarding", async (c) => {
    if (settings().onboarded) return c.json({ error: "already onboarded" }, 409);
    const body = await json(c);
    const currencies = shortlist(body.baseCurrency, body.currencies);
    if (!currencies) return c.json({ error: "invalid currencies" }, 400);
    db.transaction(() => {
      db.update(t.settings).set({ baseCurrency: body.baseCurrency, currencies, onboarded: true }).run();
      defaultCategories.forEach(([name, icon, color, children = []], i) => {
        const { id } = db.insert(cat).values({ name, icon, color, sort: i }).returning({ id: cat.id }).get();
        children.forEach(([child, childIcon], j) => db.insert(cat).values({ name: child, icon: childIcon, color, parentId: id, sort: j }).run());
      });
    });
    return c.json(settings());
  });

  return app;
}
