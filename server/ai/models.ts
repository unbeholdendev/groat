import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Deps } from "../context";
import type { Db } from "../db";
import { fail } from "../request";
import * as schema from "../schema";
import type { ChatGpt } from "./chatgpt/account";
import { complete as completion, type Streaming } from "./completion";
import {
  chatModels,
  fetchModels,
  type Listed,
  only,
  type Provider,
  providerId,
  providers,
  speechModels,
} from "./providers";

const transcript = z.object({ text: z.string() });
type Request = { messages: Record<string, unknown>[]; [key: string]: unknown };

const unset = { chat: "AI isn’t set up", vision: "Photo reading isn’t set up", voice: "Voice input isn’t set up" };

export type Ai = ReturnType<typeof aiModels>;

export function aiModels({
  db,
  fetch,
  chatgpt,
}: Pick<Deps, "fetch"> & { db: Db; chatgpt: Pick<ChatGpt, "connected" | "credential" | "catalogue"> }) {
  const cached = new Map<string, Listed>();

  const list = async (provider: Provider) => {
    try {
      const fresh = await fetchModels(fetch, provider);
      cached.set(providerId(provider), fresh);
      return fresh;
    } catch (e) {
      const last = cached.get(providerId(provider));
      if (!last) throw e;
      return last;
    }
  };
  const known = async (provider: Provider) =>
    cached.get(providerId(provider)) ?? list(provider).catch((): Listed => []);
  const remember = (lists: [Provider, Listed][]) => {
    cached.clear();
    for (const [provider, listed] of lists) cached.set(providerId(provider), listed);
  };
  const saved = () => db.select().from(schema.settings).get();
  const current = () => providers(saved());

  const chatModel = async () => {
    const provider = current().chat;
    return provider ? (saved()?.chatModel ?? only(chatModels(await known(provider)))) : null;
  };
  // ChatGPT routes report its failures as 400; used as the AI provider they are upstream failures.
  const upstream = (e: unknown) => {
    if (e instanceof HTTPException) fail(502, e.message);
    throw e;
  };
  const own = async () => {
    const saved = await chatgpt.credential().catch(upstream);
    if (!saved) return;
    const model = saved.model ?? (await chatgpt.catalogue().catch(upstream))[0]?.slug;
    if (!model) fail(502, "Choose a ChatGPT model in Settings");
    return { key: saved.access_token, model };
  };
  const sender = async (use: "chat" | "vision") => {
    const subscribed = await own();
    if (subscribed)
      return (request: Request, streaming?: Streaming) =>
        completion(
          fetch,
          { ...subscribed, base: "https://api.openai.com/v1", api: "openai-responses" },
          request,
          streaming,
        );
    const provider = current().chat;
    const model = await chatModel();
    const used = use === "vision" ? (saved()?.visionModel ?? model) : model;
    return provider && used
      ? (request: Request, streaming?: Streaming) =>
          completion(fetch, { ...provider, model: used, api: "openai-completions" }, request, streaming)
      : null;
  };
  const sttModel = async () => {
    const provider = current().stt;
    return provider ? (saved()?.sttModel ?? only(speechModels(await known(provider)))) : null;
  };
  const stt = async () => {
    const provider = current().stt;
    const model = provider && (await sttModel());
    return provider && model && (await sender("chat")) ? { ...provider, model } : null;
  };

  const unavailable = async (use: keyof typeof unset) =>
    (use === "voice" ? await stt() : await sender(use)) ? null : unset[use];
  const complete = async (request: Request, use: "chat" | "vision" = "chat", streaming?: Streaming) => {
    const send = await sender(use);
    if (!send) fail(502, unset.chat);
    return send(request, streaming);
  };
  const transcribe = async (audio: File) => {
    const provider = await stt();
    if (!provider) fail(502, unset.voice);
    const form = new FormData();
    form.append("file", audio);
    form.append("model", provider.model);
    const res = await fetch(`${provider.base}/audio/transcriptions`, {
      method: "POST",
      headers: { authorization: `Bearer ${provider.key}` },
      body: form,
    }).catch(() => fail(502, `Couldn’t reach ${provider.base}`));
    if (!res.ok) fail(502, `The speech-to-text provider returned an error (${res.status})`);
    const heard = transcript.safeParse(await res.json().catch(() => undefined));
    if (!heard.success) fail(502, "The speech-to-text provider sent an unexpected reply");
    return heard.data.text;
  };
  const source = () => {
    if (chatgpt.connected()) return "chatgpt";
    return current().chat ? "key" : null;
  };
  const status = async () => {
    const problem = await unavailable("chat").catch((e: Error) => e);
    const working = problem === null;
    const on = async (use: "vision" | "voice") =>
      working &&
      (await unavailable(use).then(
        (reason) => !reason,
        () => false,
      ));
    return {
      ai: working,
      aiSource: source(),
      aiProblem: problem instanceof HTTPException ? problem.message : null,
      vision: await on("vision"),
      voice: await on("voice"),
    };
  };

  return { complete, transcribe, unavailable, status, saved, current, chatModel, sttModel, list, remember };
}
