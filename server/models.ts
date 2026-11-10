import { Hono } from "hono";
import { z } from "zod";
import type { Deps } from "./app";
import { admin, type Env } from "./auth";
import type { chatgpt } from "./chatgpt";
import type { Db } from "./db";
import { body } from "./request";
import { complete as completion, type Streaming } from "./completion";
import * as t from "./schema";

export const chatMessage = z.looseObject({
  role: z.string(),
  content: z.string().nullish(),
  tool_calls: z.array(z.looseObject({ id: z.string(), function: z.looseObject({ name: z.string(), arguments: z.string() }) })).optional(),
  tool_call_id: z.string().optional(),
});
export type Message = z.infer<typeof chatMessage>;
const transcript = z.object({ text: z.string() });

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
type Request = { messages: Record<string, unknown>[]; [key: string]: unknown };

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

export type Ai = ReturnType<typeof aiModels>;

type Saved = Pick<typeof t.settings.$inferSelect, "aiBaseUrl" | "aiKey" | "sttBaseUrl" | "sttKey">;

const providers = (s: Saved | undefined) => {
  const chat = s?.aiBaseUrl && s.aiKey ? { base: s.aiBaseUrl, key: s.aiKey } : undefined;
  return { chat, stt: chat && { base: s?.sttBaseUrl || chat.base, key: s?.sttKey || chat.key } };
};
const ending = (key: string | null) => key && (key.length > 8 ? key.slice(-4) : "");

const url = z
  .string("Enter the base URL")
  .trim()
  .transform((s) => s.replace(/\/+$/, ""))
  .pipe(z.union([z.literal(""), z.url({ protocol: /^https?$/, error: "Enter a URL starting with http:// or https://" })]));
const secret = z.string("Invalid key").trim().optional();
const providerInput = z.object({ baseUrl: url, key: secret, sttBaseUrl: url.default(""), sttKey: secret });

const unset = { chat: "AI isn’t set up", vision: "Photo reading isn’t set up", voice: "Voice input isn’t set up" };

export function aiModels(db: Db, fetch: Deps["fetch"], subscription: Pick<ReturnType<typeof chatgpt>, "connected" | "credential" | "catalogue">) {
  const cached = new Map<string, Listed>();
  const id = ({ base, key }: Provider) => `${base}\n${key}`;

  const fetchList = async ({ base, key }: Provider, name = "AI provider") => {
    const res = await fetch(`${base}/models`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(5000) }).catch(() => {
      throw new Error(`Couldn’t reach ${base}`);
    });
    if (res.status === 401 || res.status === 403) throw new Error(`The ${name} refused the key (${res.status})`);
    if (!res.ok) throw new Error(`The ${name} returned an error (${res.status}) listing models`);
    const parsed = listing.safeParse(await res.json().catch(() => undefined));
    if (!parsed.success) throw new Error(`The ${name} sent an unexpected model list`);
    return parsed.data.data;
  };
  const list = async (p: Provider) => {
    try {
      const fresh = await fetchList(p);
      cached.set(id(p), fresh);
      return fresh;
    } catch (e) {
      const last = cached.get(id(p));
      if (!last) throw e;
      return last;
    }
  };
  const known = async (p: Provider) => cached.get(id(p)) ?? list(p).catch((): Listed => []);
  const saved = () => db.select().from(t.settings).get();
  const current = () => providers(saved());

  const chatModel = async () => {
    const p = current().chat;
    return p ? (saved()?.chatModel ?? only(chatModels(await known(p)))) : null;
  };
  const own = async () => {
    const saved = await subscription.credential();
    if (!saved) return;
    const model = saved.model ?? (await subscription.catalogue())[0]?.slug;
    if (!model) throw new Error("Choose a ChatGPT model in Settings");
    return { key: saved.access_token, model };
  };
  const sender = async (use: "chat" | "vision") => {
    const subscribed = await own();
    if (subscribed) return (request: Request, streaming?: Streaming) => completion(fetch, { ...subscribed, base: "https://api.openai.com/v1", api: "openai-responses" }, request, streaming);
    const p = current().chat;
    const model = await chatModel();
    const used = use === "vision" ? (saved()?.visionModel ?? model) : model;
    return p && used ? (request: Request, streaming?: Streaming) => completion(fetch, { ...p, model: used, api: "openai-completions" }, request, streaming) : null;
  };
  const sttModel = async () => {
    const p = current().stt;
    return p ? (saved()?.sttModel ?? only(speechModels(await known(p)))) : null;
  };
  const stt = async () => {
    const p = current().stt;
    const model = p && (await sttModel());
    return p && model && (await sender("chat")) ? { ...p, model } : null;
  };

  const unavailable = async (use: keyof typeof unset) => ((use === "voice" ? await stt() : await sender(use)) ? null : unset[use]);
  const complete = async (request: Request, use: "chat" | "vision" = "chat", streaming?: Streaming) => {
    const send = await sender(use);
    if (!send) throw new Error(unset.chat);
    return send(request, streaming);
  };
  const transcribe = async (audio: File) => {
    const p = await stt();
    if (!p) throw new Error(unset.voice);
    const form = new FormData();
    form.append("file", audio);
    form.append("model", p.model);
    const res = await fetch(`${p.base}/audio/transcriptions`, { method: "POST", headers: { authorization: `Bearer ${p.key}` }, body: form });
    if (!res.ok) throw new Error(`The speech-to-text provider returned an error (${res.status})`);
    const heard = transcript.safeParse(await res.json().catch(() => undefined));
    if (!heard.success) throw new Error("The speech-to-text provider sent an unexpected reply");
    return heard.data.text;
  };
  const status = async () => {
    const problem = await unavailable("chat").catch((e: Error) => e);
    const working = problem === null;
    const on = async (use: "vision" | "voice") => working && (await unavailable(use).then((reason) => !reason, () => false));
    return {
      ai: working,
      aiSource: subscription.connected() ? "chatgpt" : current().chat ? "key" : null,
      aiProblem: problem instanceof Error ? problem.message : null,
      vision: await on("vision"),
      voice: await on("voice"),
    };
  };

  const options = (p: Provider, pick: (l: Listed) => string[]) =>
    list(p).then(
      (l) => ({ models: pick(l) }),
      (e: Error) => ({ models: [], error: e.message }),
    );
  const view = async () => {
    const { chat: chatProvider, stt: sttProvider } = current();
    if (!chatProvider || !sttProvider) return null;
    const [chats, heard] = await Promise.all([options(chatProvider, chatModels), options(sttProvider, sttModels)]);
    return { chat: { ...chats, model: await chatModel() }, vision: { ...chats, model: saved()?.visionModel ?? await chatModel() }, stt: { ...heard, model: await sttModel() } };
  };
  const listed = async (model: string | undefined, p: Provider, pick: (l: Listed) => string[]) => !model || pick(await list(p)).includes(model);
  const provider = () => {
    const s = saved();
    return { baseUrl: s?.aiBaseUrl ?? null, keyEnding: ending(s?.aiKey ?? null), sttBaseUrl: s?.sttBaseUrl ?? null, sttKeyEnding: ending(s?.sttKey ?? null) };
  };

  const routes = new Hono<Env>();

  routes.use("/api/models", admin);
  routes.use("/api/ai", admin);

  routes.get("/api/models", async (c) => c.json(await view()));

  routes.put("/api/models", async (c) => {
    const input = await body(c, choice);
    if ("error" in input) return c.json(input, 400);
    const { chat: chatProvider, stt: sttProvider } = current();
    if (!chatProvider || !sttProvider) return c.json({ error: "AI isn’t set up" }, 400);
    const { chat: chatModel, vision: visionModel, stt: sttChoice } = input.data;
    const known = (await listed(chatModel, chatProvider, chatModels)) && (await listed(visionModel, chatProvider, chatModels)) && (await listed(sttChoice, sttProvider, sttModels));
    if (!known) return c.json({ error: "Pick a model from the list" }, 400);
    const now = current();
    if (!now.chat || !now.stt || id(now.chat) !== id(chatProvider) || id(now.stt) !== id(sttProvider)) return c.json({ error: "The AI provider changed. Try again." }, 409);
    db.update(t.settings).set({ chatModel, visionModel, sttModel: sttChoice }).run();
    return c.json(await view());
  });

  routes.get("/api/ai/status", async (c) => c.json(await status()));

  routes.get("/api/ai", (c) => c.json(provider()));

  routes.put("/api/ai", async (c) => {
    const input = await body(c, providerInput);
    if ("error" in input) return c.json(input, 400);
    const { baseUrl, key, sttBaseUrl, sttKey } = input.data;
    const before = saved();
    if (!baseUrl) {
      db.update(t.settings).set({ aiBaseUrl: null, aiKey: null, sttBaseUrl: null, sttKey: null }).run();
      return c.json(provider());
    }
    const next = { aiBaseUrl: baseUrl, aiKey: (key ?? before?.aiKey) || null, sttBaseUrl: sttBaseUrl || null, sttKey: (sttKey ?? before?.sttKey) || null };
    const { chat: chatProvider, stt: sttProvider } = providers(next);
    const was = providers(before);
    // A saved key only goes where it was already sent; a key typed in this request may go anywhere.
    const allowed = (p: Provider) => p.key === key || p.key === sttKey || [was.chat, was.stt].some((w) => w && id(w) === id(p));
    if (!chatProvider || !sttProvider || !allowed(chatProvider)) return c.json({ error: "Enter the API key" }, 400);
    if (!allowed(sttProvider)) return c.json({ error: "Enter the speech-to-text key" }, 400);
    const lists = await Promise.all([fetchList(chatProvider), id(sttProvider) === id(chatProvider) ? null : fetchList(sttProvider, "speech-to-text provider")]).catch((e: Error) => e);
    if (lists instanceof Error) return c.json({ error: lists.message }, 400);
    const [chats, separate] = lists;
    const heard = separate ?? chats;
    const keep = (model: string | null | undefined, ids: string[]) => (model && ids.includes(model) ? model : null);
    const chosen = saved();
    cached.clear();
    cached.set(id(chatProvider), chats);
    cached.set(id(sttProvider), heard);
    db.update(t.settings)
      .set({ ...next, chatModel: keep(chosen?.chatModel, chatModels(chats)), visionModel: keep(chosen?.visionModel, chatModels(chats)), sttModel: keep(chosen?.sttModel, sttModels(heard)) })
      .run();
    return c.json(provider());
  });

  routes.onError((e, c) => c.json({ error: e.message }, 502));

  return { complete, transcribe, unavailable, status, routes };
}
