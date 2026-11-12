import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../../auth/access";
import type { Ctx } from "../../context";
import { body } from "../../request";
import { chatAgent } from "./agent";
import { closeInterrupted, deleteChat, listChats } from "./store";

const question = z.object({ message: z.string("Enter a message").trim().min(1, "Enter a message") });

export function chatRoutes(ctx: Ctx) {
  const { db, ai } = ctx;
  const app = new Hono<Env>();
  app.use("*", async (c, next) => {
    const off = c.req.method === "POST" && !c.req.path.endsWith("/stop") && (await ai.unavailable("chat"));
    return off ? c.json({ error: off }, 403) : next();
  });

  closeInterrupted(db);
  const agent = chatAgent(ctx);

  app.get("/", (c) => c.json(listChats(db)));

  app.post("/", async (c) => {
    const input = await body(c, question);
    if ("error" in input) return c.json(input, 400);
    return c.json(agent.ask(null, input.data.message, c.req.header("cookie") ?? ""), 202);
  });

  app.get("/:id", (c) => {
    const found = agent.chat(c.req.param("id"));
    return found ? c.json(found) : c.json({ error: "Not found" }, 404);
  });

  app.post("/:id/messages", async (c) => {
    const input = await body(c, question);
    const id = Number(c.req.param("id"));
    if (!agent.chat(id)) return c.json({ error: "Not found" }, 404);
    if ("error" in input) return c.json(input, 400);
    if (agent.running(id)) return c.json({ error: "Wait for the reply, or stop it first" }, 409);
    return c.json(agent.ask(id, input.data.message, c.req.header("cookie") ?? ""), 202);
  });

  app.post("/:id/stop", (c) => {
    const id = Number(c.req.param("id"));
    if (!agent.chat(id)) return c.json({ error: "Not found" }, 404);
    agent.stop(id);
    return c.json({});
  });

  app.delete("/:id", (c) => {
    const id = Number(c.req.param("id"));
    agent.forget(id);
    return deleteChat(db, id) ? c.json({}) : c.json({ error: "Not found" }, 404);
  });

  return app;
}
