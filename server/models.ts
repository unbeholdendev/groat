import { Hono } from "hono";
import { z } from "zod";
import type { Deps } from "./app";
import type { Env } from "./auth";
import type { Db } from "./db";
import { body } from "./request";
import * as t from "./schema";

const listing = z.object({
  data: z.array(
    z.looseObject({
      id: z.string(),
      architecture: z.looseObject({ input_modalities: z.array(z.string()).optional(), output_modalities: z.array(z.string()).optional() }).optional(),
    }),
  ),
});
type Listed = z.infer<typeof listing>["data"];
type Provider = { base: string; key: string };

const model = z.string("Pick a model").min(1, "Pick a model");
const choice = z
  .object({ chat: model, vision: model, stt: model })
  .partial()
  .refine((c) => Object.keys(c).length, "Pick a model");

const notChat = /embed|tts|whisper|transcri|stt|moderation|rerank|dall-e|image|audio/i;
const speech = /whisper|transcri|stt/i;

const chatModels = (list: Listed) =>
  list
    .filter(({ id, architecture: a }) => (a?.output_modalities ? a.output_modalities.includes("text") && (a.input_modalities ?? ["text"]).includes("text") : !notChat.test(id)))
    .map((m) => m.id);
const speechModels = (list: Listed) => list.map((m) => m.id).filter((id) => speech.test(id));
// A provider whose speech models have unusual names still needs something to pick from.
const sttModels = (list: Listed) => (speechModels(list).length ? speechModels(list) : list.map((m) => m.id));
const only = (ids: string[]) => (ids.length === 1 ? ids[0] : null);

export type Models = ReturnType<typeof aiModels>;

export function aiModels(db: Db, fetch: Deps["fetch"], config: Deps["config"]) {
  const chatProvider = config.aiBaseUrl && config.aiApiKey ? { base: config.aiBaseUrl, key: config.aiApiKey } : undefined;
  const sttProvider = chatProvider && { base: config.sttBaseUrl || chatProvider.base, key: config.sttKey || chatProvider.key };
  const cached = new Map<Provider, Listed>();

  const fetchList = async ({ base, key }: Provider) => {
    const res = await fetch(`${base}/models`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`The AI provider returned an error (${res.status}) listing models`);
    const parsed = listing.safeParse(await res.json().catch(() => undefined));
    if (!parsed.success) throw new Error("The AI provider sent an unexpected model list");
    return parsed.data.data;
  };
  const list = async (p: Provider) => {
    try {
      const fresh = await fetchList(p);
      cached.set(p, fresh);
      return fresh;
    } catch (e) {
      const last = cached.get(p);
      if (!last) throw e;
      return last;
    }
  };
  const known = async (p: Provider) => cached.get(p) ?? list(p).catch((): Listed => []);
  const stored = () => db.select({ chat: t.settings.chatModel, vision: t.settings.visionModel, stt: t.settings.sttModel }).from(t.settings).get();

  const chat = async () => (chatProvider ? (stored()?.chat ?? only(chatModels(await known(chatProvider)))) : null);
  const vision = async () => {
    const used = await chat();
    return used && (stored()?.vision ?? used);
  };
  const sttModel = async () => (sttProvider ? (stored()?.stt ?? only(speechModels(await known(sttProvider)))) : null);
  const stt = async () => {
    const used = (await chat()) && (await sttModel());
    return used && sttProvider ? { ...sttProvider, model: used } : null;
  };

  const options = (p: Provider, pick: (l: Listed) => string[]) =>
    list(p).then(
      (l) => ({ models: pick(l) }),
      (e: Error) => ({ models: [], error: e.message }),
    );
  const view = async () => {
    if (!chatProvider || !sttProvider) return null;
    const [chats, heard] = await Promise.all([options(chatProvider, chatModels), options(sttProvider, sttModels)]);
    return { chat: { ...chats, model: await chat() }, vision: { ...chats, model: await vision() }, stt: { ...heard, model: await sttModel() } };
  };
  const listed = async (model: string | undefined, p: Provider, pick: (l: Listed) => string[]) => !model || pick(await list(p)).includes(model);

  const routes = new Hono<Env>();

  routes.use("/api/models", async (c, next) => {
    if (c.get("user").role !== "admin") return c.json({ error: "Only admins can do that" }, 403);
    await next();
  });

  routes.get("/api/models", async (c) => c.json(await view()));

  routes.put("/api/models", async (c) => {
    const input = await body(c, choice);
    if ("error" in input) return c.json(input, 400);
    if (!chatProvider || !sttProvider) return c.json({ error: "AI isn’t set up" }, 400);
    const { chat: chatModel, vision: visionModel, stt: sttChoice } = input.data;
    const known = (await listed(chatModel, chatProvider, chatModels)) && (await listed(visionModel, chatProvider, chatModels)) && (await listed(sttChoice, sttProvider, sttModels));
    if (!known) return c.json({ error: "Pick a model from the list" }, 400);
    db.update(t.settings).set({ chatModel, visionModel, sttModel: sttChoice }).run();
    return c.json(await view());
  });

  routes.onError((e, c) => c.json({ error: e.message }, 502));

  return { chat, vision, stt, routes };
}
