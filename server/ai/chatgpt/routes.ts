import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { z } from "zod";
import { admin, type Env } from "../../auth/access";
import type { Ctx } from "../../context";
import { body } from "../../request";

export function chatgptRoutes({ chatgpt }: Pick<Ctx, "chatgpt">) {
  const routes = new Hono<Env>();
  routes.use("/api/chatgpt", admin);
  routes.use("/api/chatgpt/*", admin);
  routes.get("/api/chatgpt", (c) => c.json(chatgpt.status(getCookie(c, "session"))));
  routes.post("/api/chatgpt/start", (c) => c.json({ url: chatgpt.startSignIn(getCookie(c, "session") ?? "") }));
  routes.delete("/api/chatgpt/start", (c) => {
    chatgpt.cancelSignIn();
    return c.json({});
  });
  routes.post("/api/chatgpt/callback", async (c) => {
    const pending = chatgpt.pending();
    const input = await body(c, z.object({ callback: z.string().max(16384) }));
    if ("error" in input) return c.json(input, 400);
    if (!(await chatgpt.finishSignIn(pending, input.data.callback, getCookie(c, "session"))))
      return c.json({ error: "ChatGPT connection was declined. You can try again." }, 400);
    return c.json({ connected: true });
  });
  routes.get("/api/chatgpt/models", async (c) => c.json({ models: await chatgpt.catalogue() }));
  routes.put("/api/chatgpt/model", async (c) => {
    const input = await body(c, z.object({ model: z.string() }));
    if ("error" in input) return c.json(input, 400);
    await chatgpt.chooseModel(input.data.model);
    return c.json({});
  });
  routes.delete("/api/chatgpt", async (c) => c.json({ revocationConfirmed: await chatgpt.disconnect() }));
  return routes;
}
