import type { AssistantMessage, Model } from "@earendil-works/pi-ai";
import { stream as completions } from "@earendil-works/pi-ai/api/openai-completions";
import { stream as responses } from "@earendil-works/pi-ai/api/openai-responses";
import { z } from "zod";
import type { Deps } from "../context";
import { diagnostic, log } from "../logging";
import { fail } from "../request";
import { piContext, requestSchema } from "./pi-context";

type Provider = { api: "openai-completions" | "openai-responses"; base: string; key: string; model: string };
export type Streaming = { signal?: AbortSignal; onText?: (text: string) => void };

export async function complete(
  fetch: Deps["fetch"],
  provider: Provider,
  request: object,
  { signal, onText }: Streaming = {},
) {
  const parsed = requestSchema.parse(request);
  const subscribed = provider.api === "openai-responses";
  const model: Model<typeof provider.api> = {
    id: provider.model,
    name: provider.model,
    api: provider.api,
    provider: subscribed ? "openai" : "groat",
    baseUrl: provider.base,
    reasoning: subscribed,
    input: ["text", "image"],
    contextWindow: 0,
    maxTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    ...(!subscribed && {
      compat: { supportsDeveloperRole: false, supportsStore: false, supportsUsageInStreaming: false },
    }),
  };
  const context = piContext(parsed, model, subscribed);
  let status: number | undefined;
  let requestId: string | undefined;
  let failed = false;
  let rejection: Record<string, unknown> | undefined;
  const options = {
    apiKey: provider.key,
    fetch: Object.assign(
      async (input: string | URL | Request, init?: RequestInit) => {
        const res = await fetch(input, init);
        status = res.status;
        requestId = diagnostic(res.headers.get("x-request-id"));
        if (!res.ok)
          rejection = z.object({ error: z.looseObject({}) }).safeParse(
            await res
              .clone()
              .json()
              .catch(() => null),
          ).data?.error;
        return res;
      },
      { preconnect: globalThis.fetch.preconnect },
    ),
    signal: AbortSignal.any([AbortSignal.timeout(120000), ...(signal ? [signal] : [])]),
    maxRetries: 0,
    onProviderStreamEvent: (data: unknown) => {
      if (!subscribed) return;
      const event = z
        .looseObject({
          type: z.string(),
          response: z.any().optional(),
          error: z.any().optional(),
          code: z.any().optional(),
          message: z.any().optional(),
          param: z.any().optional(),
        })
        .parse(data);
      if (!["response.failed", "response.incomplete", "error"].includes(event.type)) return;
      failed = true;
      const failure = event.type === "error" ? (event.error ?? event) : event.response?.error;
      log("error", "ai.response.failed", {
        operation: event.type,
        providerRequestId: requestId,
        code: diagnostic(failure?.code),
        errorType: diagnostic(failure?.type === "error" ? undefined : failure?.type),
        param: diagnostic(failure?.param),
        hasMessage: typeof failure?.message === "string",
        reason: diagnostic(event.response?.incomplete_details?.reason),
      });
    },
  };
  const name = parsed.tool_choice?.function.name;
  const stream = subscribed
    ? responses(model as Model<"openai-responses">, context, {
        ...options,
        ...(name && { toolChoice: "required" as const }),
        onPayload: (payload) => {
          const { reasoning, ...p } = z.looseObject({ tools: z.array(z.looseObject({})).optional() }).parse(payload);
          return {
            ...p,
            ...(p.tools && {
              tools: [
                {
                  type: "namespace",
                  name: "groat",
                  description: "Groat ledger tools",
                  tools: p.tools.filter((t) => !name || t.name === name).map((t) => ({ ...t, strict: false })),
                },
              ],
            }),
          };
        },
      })
    : completions(model as Model<"openai-completions">, context, {
        ...options,
        ...(name && { toolChoice: { type: "function", function: { name } } }),
      });
  if (onText)
    for await (const event of stream)
      if (event.type === "text_delta")
        onText(event.partial.content.flatMap((c) => (c.type === "text" ? c.text : [])).join(""));
  const reply = await stream.result();
  if (failed || !["stop", "toolUse"].includes(reply.stopReason)) {
    if (!subscribed)
      fail(
        502,
        status && status >= 400
          ? `The AI provider returned an error (${status})`
          : "The AI provider sent an unexpected reply",
      );
    if (!failed)
      log("error", "ai.response.failed", {
        operation: "stream",
        providerRequestId: requestId,
        reason: diagnostic(reply.stopReason),
        code: diagnostic(rejection?.code),
        errorType: diagnostic(rejection?.type),
        param: diagnostic(rejection?.param),
      });
    if (status === 401 || status === 403) fail(502, "ChatGPT needs you to sign in again. Open Settings and reconnect.");
    if (status && status >= 400) fail(502, `ChatGPT returned an error (${status}). Try again.`);
    fail(
      502,
      "ChatGPT could not finish this response. Check your plan usage or reconnect in Settings, then try again.",
    );
  }
  return replyMessage(reply, subscribed);
}

function replyMessage(reply: AssistantMessage, subscribed: boolean) {
  const toolCalls = reply.content.filter((c) => c.type === "toolCall");
  if (toolCalls.some((c) => c.namespace && c.namespace !== "groat")) fail(502, "ChatGPT returned an unknown tool");
  return {
    role: "assistant",
    modelMessage: reply,
    content: reply.content
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join(""),
    ...(toolCalls.length && {
      tool_calls: toolCalls.map((c) => ({
        id: subscribed ? c.id.split("|")[0] : c.id,
        type: "function",
        function: { name: c.name, arguments: c.argumentsError ? "null" : JSON.stringify(c.arguments) },
      })),
    }),
  };
}
