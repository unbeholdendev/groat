import { z } from "zod";
import type { Deps } from "../context";
import type * as schema from "../schema";

const listing = z.object({
  data: z.array(
    z.looseObject({
      id: z.string(),
      architecture: z
        .looseObject({
          input_modalities: z.array(z.string()).optional(),
          output_modalities: z.array(z.string()).optional(),
        })
        .optional(),
    }),
  ),
});
export type Listed = z.infer<typeof listing>["data"];
export type Provider = { base: string; key: string };

const notChat = /embed|tts|whisper|transcri|stt|moderation|rerank|dall-e|image|audio/i;
const speech = /whisper|transcri|stt/i;

export const chatModels = (list: Listed) =>
  list
    .filter(({ id, architecture: a }) =>
      a?.output_modalities
        ? a.output_modalities.includes("text") && (a.input_modalities ?? ["text"]).includes("text")
        : !notChat.test(id),
    )
    .map((m) => m.id);
export const speechModels = (list: Listed) => list.map((m) => m.id).filter((id) => speech.test(id));
// A provider whose speech models have unusual names still needs something to pick from.
export const sttModels = (list: Listed) => (speechModels(list).length ? speechModels(list) : list.map((m) => m.id));
export const only = (ids: string[]) => (ids.length === 1 ? ids[0] : null);

type Saved = Pick<typeof schema.settings.$inferSelect, "aiBaseUrl" | "aiKey" | "sttBaseUrl" | "sttKey">;

export const providers = (s: Saved | undefined) => {
  const chat = s?.aiBaseUrl && s.aiKey ? { base: s.aiBaseUrl, key: s.aiKey } : undefined;
  return { chat, stt: chat && { base: s?.sttBaseUrl || chat.base, key: s?.sttKey || chat.key } };
};

export const providerId = ({ base, key }: Provider) => `${base}\n${key}`;

export async function fetchModels(fetch: Deps["fetch"], { base, key }: Provider, name = "AI provider") {
  const res = await fetch(`${base}/models`, {
    headers: { authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(5000),
  }).catch(() => {
    throw new Error(`Couldn’t reach ${base}`);
  });
  if (res.status === 401 || res.status === 403) throw new Error(`The ${name} refused the key (${res.status})`);
  if (!res.ok) throw new Error(`The ${name} returned an error (${res.status}) listing models`);
  const parsed = listing.safeParse(await res.json().catch(() => undefined));
  if (!parsed.success) throw new Error(`The ${name} sent an unexpected model list`);
  return parsed.data.data;
}
