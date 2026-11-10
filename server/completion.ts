import type { AssistantMessage, Model, Message as PiMessage } from "@earendil-works/pi-ai";
import { stream as completions } from "@earendil-works/pi-ai/api/openai-completions";
import { stream as responses } from "@earendil-works/pi-ai/api/openai-responses";
import { normalizeContext } from "@earendil-works/pi-ai/utils/transcript";
import { z } from "zod";
import type { Deps } from "./app";
import { diagnostic, log } from "./logging";

const requestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["system", "user", "assistant", "tool"]),
    content: z.union([z.string(), z.array(z.object({ type: z.literal("image_url"), image_url: z.object({ url: z.string() }) }))]).nullish(),
    tool_call_id: z.string().optional(),
    tool_calls: z.array(z.object({ id: z.string(), function: z.object({ name: z.string(), arguments: z.string() }) })).optional(),
    modelMessage: z.custom<AssistantMessage>().optional(),
  })),
  tools: z.array(z.object({ function: z.object({ name: z.string(), description: z.string().default(""), parameters: z.record(z.string(), z.unknown()) }) })).optional(),
  tool_choice: z.object({ function: z.object({ name: z.string() }) }).optional(),
});

type Provider = { api: "openai-completions" | "openai-responses"; base: string; key: string; model: string };
export type Streaming = { signal?: AbortSignal; onText?: (text: string) => void };

export async function complete(fetch: Deps["fetch"], provider: Provider, request: object, { signal, onText }: Streaming = {}) {
  const parsed = requestSchema.parse(request);
  const subscribed = provider.api === "openai-responses";
  const model: Model<typeof provider.api> = {
    id: provider.model, name: provider.model, api: provider.api,
    provider: subscribed ? "openai" : "groat", baseUrl: provider.base,
    reasoning: subscribed, input: ["text", "image"], contextWindow: 0, maxTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    ...(!subscribed && { compat: { supportsDeveloperRole: false, supportsStore: false, supportsUsageInStreaming: false } }),
  };
  const messages: PiMessage[] = [];
  const calls = new Map<string, { name: string; id: string }>();
  for (const m of parsed.messages) {
    for (const call of m.tool_calls ?? []) calls.set(call.id, { name: call.function.name, id: call.id });
    for (const call of m.modelMessage?.content ?? [])
      if (call.type === "toolCall") calls.set(subscribed ? call.id.split("|")[0] : call.id, { name: call.name, id: call.id });
    if (m.modelMessage) {
      messages.push(m.modelMessage);
    } else if (m.role === "assistant") {
      messages.push({
        role: "assistant", api: model.api, provider: model.provider, model: model.id,
        content: [
          ...(typeof m.content === "string" && m.content ? [{ type: "text" as const, text: m.content }] : []),
          ...(m.tool_calls ?? []).map((c) => {
            let args = null;
            try { args = JSON.parse(c.function.arguments); } catch {}
            return { type: "toolCall" as const, id: c.id, name: c.function.name, arguments: args, ...(subscribed && { namespace: "groat" }) };
          }),
        ],
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: m.tool_calls?.length ? "toolUse" : "stop", timestamp: 0,
      });
    } else if (m.role === "tool") {
      messages.push({ role: "toolResult", toolCallId: calls.get(m.tool_call_id!)?.id ?? m.tool_call_id!, toolName: calls.get(m.tool_call_id!)?.name ?? "", content: [{ type: "text", text: String(m.content ?? "") }], isError: false, timestamp: 0 });
    } else if (m.role === "system") {
      messages.push({ role: "system", content: String(m.content ?? ""), timestamp: 0 });
    } else {
      messages.push({ role: "user", timestamp: 0, content: typeof m.content === "string" ? m.content : (m.content ?? []).map((p) => {
        const image = /^data:([^;]+);base64,(.+)$/s.exec(p.image_url.url);
        if (!image) throw new Error("The receipt image must be base64 encoded");
        return { type: "image" as const, mimeType: image[1], data: image[2] };
      }) });
    }
  }
  const context = normalizeContext({ messages, tools: parsed.tools?.map((t) => t.function) });
  let status: number | undefined;
  let requestId: string | undefined;
  let failed = false;
  let rejection: Record<string, unknown> | undefined;
  const options = {
    apiKey: provider.key,
    fetch: Object.assign(async (input: string | URL | Request, init?: RequestInit) => {
      const res = await fetch(input, init);
      status = res.status;
      requestId = diagnostic(res.headers.get("x-request-id"));
      if (!res.ok) rejection = z.object({ error: z.looseObject({}) }).safeParse(await res.clone().json().catch(() => null)).data?.error;
      return res;
    }, { preconnect: globalThis.fetch.preconnect }),
    signal: AbortSignal.any([AbortSignal.timeout(120000), ...(signal ? [signal] : [])]), maxRetries: 0,
    onProviderStreamEvent: (data: unknown) => {
      if (!subscribed) return;
      const event = z.looseObject({ type: z.string(), response: z.any().optional(), error: z.any().optional(), code: z.any().optional(), message: z.any().optional(), param: z.any().optional() }).parse(data);
      if (!["response.failed", "response.incomplete", "error"].includes(event.type)) return;
      failed = true;
      const failure = event.type === "error" ? event.error ?? event : event.response?.error;
      log("error", "ai.response.failed", {
        operation: event.type, providerRequestId: requestId, code: diagnostic(failure?.code),
        errorType: diagnostic(failure?.type === "error" ? undefined : failure?.type), param: diagnostic(failure?.param),
        hasMessage: typeof failure?.message === "string", reason: diagnostic(event.response?.incomplete_details?.reason),
      });
    },
  };
  const name = parsed.tool_choice?.function.name;
  const stream = subscribed
    ? responses(model as Model<"openai-responses">, context, {
        ...options,
        ...(name && { toolChoice: { type: "function", name } }),
        onPayload: (payload) => {
          const { reasoning, ...p } = z.looseObject({ tools: z.array(z.looseObject({})).optional() }).parse(payload);
          return { ...p, ...(name && { tool_choice: { type: "function", namespace: "groat", name } }), ...(p.tools && { tools: [{ type: "namespace", name: "groat", description: "Groat ledger tools", tools: p.tools.map((t) => ({ ...t, strict: false })) }] }) };
        },
      })
    : completions(model as Model<"openai-completions">, context, { ...options, ...(name && { toolChoice: { type: "function", function: { name } } }) });
  if (onText) for await (const event of stream)
    if (event.type === "text_delta") onText(event.partial.content.flatMap((c) => (c.type === "text" ? c.text : [])).join(""));
  const reply = await stream.result();
  if (failed || !["stop", "toolUse"].includes(reply.stopReason)) {
    if (!subscribed) throw new Error(status && status >= 400 ? `The AI provider returned an error (${status})` : "The AI provider sent an unexpected reply");
    if (!failed) log("error", "ai.response.failed", {
      operation: "stream", providerRequestId: requestId, reason: diagnostic(reply.stopReason),
      code: diagnostic(rejection?.code), errorType: diagnostic(rejection?.type), param: diagnostic(rejection?.param),
    });
    if (status === 401 || status === 403) throw new Error("ChatGPT needs you to sign in again. Open Settings and reconnect.");
    if (status && status >= 400) throw new Error(`ChatGPT returned an error (${status}). Try again.`);
    throw new Error("ChatGPT could not finish this response. Check your plan usage or reconnect in Settings, then try again.");
  }
  const toolCalls = reply.content.filter((c) => c.type === "toolCall");
  if (toolCalls.some((c) => c.namespace && c.namespace !== "groat")) throw new Error("ChatGPT returned an unknown tool");
  return {
    role: "assistant", modelMessage: reply,
    content: reply.content.filter((c) => c.type === "text").map((c) => c.text).join(""),
    ...(toolCalls.length && { tool_calls: toolCalls.map((c) => ({ id: subscribed ? c.id.split("|")[0] : c.id, type: "function", function: { name: c.name, arguments: c.argumentsError ? "null" : JSON.stringify(c.arguments) } })) }),
  };
}
