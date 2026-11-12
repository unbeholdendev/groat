import { HTTPException } from "hono/http-exception";
import type { Ctx } from "../context";
import * as schema from "../schema";
import { chatModels, fetchModels, type Listed, type Provider, providerId, providers, sttModels } from "./providers";

type Choice = { chat?: string; vision?: string; stt?: string };
type ProviderInput = { baseUrl: string; key?: string; sttBaseUrl: string; sttKey?: string };

const ending = (key: string | null) => key && (key.length > 8 ? key.slice(-4) : "");

const reported = (e: unknown) => {
  if (e instanceof HTTPException) return e;
  throw e;
};

const options = (ai: Ctx["ai"], provider: Provider, pick: (l: Listed) => string[]) =>
  ai.list(provider).then(
    (l) => ({ models: pick(l) }),
    (e) => ({ models: [], error: reported(e).message }),
  );

export async function modelChoices({ ai }: Pick<Ctx, "ai">) {
  const { chat: chatProvider, stt: sttProvider } = ai.current();
  if (!chatProvider || !sttProvider) return null;
  const [chats, heard] = await Promise.all([
    options(ai, chatProvider, chatModels),
    options(ai, sttProvider, sttModels),
  ]);
  return {
    chat: { ...chats, model: await ai.chatModel() },
    vision: { ...chats, model: ai.saved()?.visionModel ?? (await ai.chatModel()) },
    stt: { ...heard, model: await ai.sttModel() },
  };
}

export function providerSummary({ ai }: Pick<Ctx, "ai">) {
  const s = ai.saved();
  return {
    baseUrl: s?.aiBaseUrl ?? null,
    keyEnding: ending(s?.aiKey ?? null),
    sttBaseUrl: s?.sttBaseUrl ?? null,
    sttKeyEnding: ending(s?.sttKey ?? null),
  };
}

export async function chooseModels(ctx: Pick<Ctx, "db" | "ai">, choice: Choice) {
  const { db, ai } = ctx;
  const { chat: chatProvider, stt: sttProvider } = ai.current();
  if (!chatProvider || !sttProvider) return { error: "AI isn’t set up", status: 400 } as const;
  const { chat: chatModel, vision: visionModel, stt: sttChoice } = choice;
  const listed = async (model: string | undefined, provider: Provider, pick: (l: Listed) => string[]) =>
    !model || pick(await ai.list(provider)).includes(model);
  const known =
    (await listed(chatModel, chatProvider, chatModels)) &&
    (await listed(visionModel, chatProvider, chatModels)) &&
    (await listed(sttChoice, sttProvider, sttModels));
  if (!known) return { error: "Pick a model from the list", status: 400 } as const;
  const now = ai.current();
  if (
    !now.chat ||
    !now.stt ||
    providerId(now.chat) !== providerId(chatProvider) ||
    providerId(now.stt) !== providerId(sttProvider)
  )
    return { error: "The AI provider changed. Try again.", status: 409 } as const;
  db.update(schema.settings).set({ chatModel, visionModel, sttModel: sttChoice }).run();
  return { choices: await modelChoices(ctx) };
}

export async function configureProvider(ctx: Pick<Ctx, "db" | "ai" | "fetch">, input: ProviderInput) {
  const { db, ai, fetch } = ctx;
  const { baseUrl, key, sttBaseUrl, sttKey } = input;
  const before = ai.saved();
  if (!baseUrl) {
    db.update(schema.settings).set({ aiBaseUrl: null, aiKey: null, sttBaseUrl: null, sttKey: null }).run();
    return providerSummary(ctx);
  }
  const next = {
    aiBaseUrl: baseUrl,
    aiKey: (key ?? before?.aiKey) || null,
    sttBaseUrl: sttBaseUrl || null,
    sttKey: (sttKey ?? before?.sttKey) || null,
  };
  const { chat: chatProvider, stt: sttProvider } = providers(next);
  const was = providers(before);
  // A saved key only goes where it was already sent; a key typed in this request may go anywhere.
  const allowed = (provider: Provider) =>
    provider.key === key ||
    provider.key === sttKey ||
    [was.chat, was.stt].some((w) => w && providerId(w) === providerId(provider));
  if (!chatProvider || !sttProvider || !allowed(chatProvider)) return { error: "Enter the API key" };
  if (!allowed(sttProvider)) return { error: "Enter the speech-to-text key" };
  const lists = await Promise.all([
    fetchModels(fetch, chatProvider),
    providerId(sttProvider) === providerId(chatProvider)
      ? null
      : fetchModels(fetch, sttProvider, "speech-to-text provider"),
  ]).catch(reported);
  if (lists instanceof HTTPException) return { error: lists.message };
  const [chats, separate] = lists;
  const heard = separate ?? chats;
  const keep = (model: string | null | undefined, ids: string[]) => (model && ids.includes(model) ? model : null);
  const chosen = ai.saved();
  ai.remember([
    [chatProvider, chats],
    [sttProvider, heard],
  ]);
  db.update(schema.settings)
    .set({
      ...next,
      chatModel: keep(chosen?.chatModel, chatModels(chats)),
      visionModel: keep(chosen?.visionModel, chatModels(chats)),
      sttModel: keep(chosen?.sttModel, sttModels(heard)),
    })
    .run();
  return providerSummary(ctx);
}
