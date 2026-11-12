import type { AssistantMessage, Model, Message as PiMessage } from "@earendil-works/pi-ai";
import { normalizeContext } from "@earendil-works/pi-ai/utils/transcript";
import { z } from "zod";

export const requestSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["system", "user", "assistant", "tool"]),
      content: z
        .union([
          z.string(),
          z.array(z.object({ type: z.literal("image_url"), image_url: z.object({ url: z.string() }) })),
        ])
        .nullish(),
      tool_call_id: z.string().optional(),
      tool_calls: z
        .array(z.object({ id: z.string(), function: z.object({ name: z.string(), arguments: z.string() }) }))
        .optional(),
      modelMessage: z.custom<AssistantMessage>().optional(),
    }),
  ),
  tools: z
    .array(
      z.object({
        function: z.object({
          name: z.string(),
          description: z.string().default(""),
          parameters: z.record(z.string(), z.unknown()),
        }),
      }),
    )
    .optional(),
  tool_choice: z.object({ function: z.object({ name: z.string() }) }).optional(),
});

export function piContext(
  parsed: z.infer<typeof requestSchema>,
  model: Model<"openai-completions" | "openai-responses">,
  subscribed: boolean,
) {
  const messages: PiMessage[] = [];
  const calls = new Map<string, { name: string; id: string }>();
  for (const m of parsed.messages) {
    for (const call of m.tool_calls ?? []) calls.set(call.id, { name: call.function.name, id: call.id });
    for (const call of m.modelMessage?.content ?? [])
      if (call.type === "toolCall")
        calls.set(subscribed ? call.id.split("|")[0] : call.id, { name: call.name, id: call.id });
    if (m.modelMessage) {
      messages.push(m.modelMessage);
    } else if (m.role === "assistant") {
      messages.push({
        role: "assistant",
        api: model.api,
        provider: model.provider,
        model: model.id,
        content: [
          ...(typeof m.content === "string" && m.content ? [{ type: "text" as const, text: m.content }] : []),
          ...(m.tool_calls ?? []).map((c) => {
            let args = null;
            try {
              args = JSON.parse(c.function.arguments);
            } catch {}
            return {
              type: "toolCall" as const,
              id: c.id,
              name: c.function.name,
              arguments: args,
              ...(subscribed && { namespace: "groat" }),
            };
          }),
        ],
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: m.tool_calls?.length ? "toolUse" : "stop",
        timestamp: 0,
      });
    } else if (m.role === "tool") {
      const callId = m.tool_call_id;
      if (callId === undefined) throw new Error("A tool result is missing its tool_call_id");
      messages.push({
        role: "toolResult",
        toolCallId: calls.get(callId)?.id ?? callId,
        toolName: calls.get(callId)?.name ?? "",
        content: [{ type: "text", text: String(m.content ?? "") }],
        isError: false,
        timestamp: 0,
      });
    } else if (m.role === "system") {
      messages.push({ role: "system", content: String(m.content ?? ""), timestamp: 0 });
    } else {
      messages.push({
        role: "user",
        timestamp: 0,
        content:
          typeof m.content === "string"
            ? m.content
            : (m.content ?? []).map((p) => {
                const image = /^data:([^;]+);base64,(.+)$/s.exec(p.image_url.url);
                if (!image) throw new Error("The receipt image must be base64 encoded");
                return { type: "image" as const, mimeType: image[1], data: image[2] };
              }),
      });
    }
  }
  return normalizeContext({ messages, tools: parsed.tools?.map((t) => t.function) });
}
