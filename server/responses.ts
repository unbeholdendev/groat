import { z } from "zod";
import type { Deps } from "./app";

const message = z.object({
  role: z.string(),
  content: z.unknown().optional(),
  tool_call_id: z.string().optional(),
  responseItems: z.array(z.looseObject({ type: z.string() })).optional(),
  tool_calls: z.array(z.object({ id: z.string(), function: z.object({ name: z.string(), arguments: z.string() }) })).optional(),
});
const requestSchema = z.object({
  messages: z.array(message),
  model: z.string().optional(),
  tools: z.array(z.object({ function: z.object({ name: z.string(), description: z.string().optional(), parameters: z.unknown() }) })).optional(),
  tool_choice: z.object({ function: z.object({ name: z.string() }) }).optional(),
});
const output = z.object({
  output: z.array(
    z.discriminatedUnion("type", [
      z.looseObject({ type: z.literal("reasoning") }),
      z.looseObject({ type: z.literal("message"), content: z.array(z.object({ type: z.string(), text: z.string().optional() })) }),
      z.looseObject({ type: z.literal("function_call"), name: z.string(), call_id: z.string(), arguments: z.string(), namespace: z.string().optional() }),
    ]),
  ),
});

export async function responses(fetch: Deps["fetch"], provider: { key: string; model: string }, request: object) {
  const parsed = requestSchema.parse(request);
  const input = parsed.messages.flatMap((m): object[] => {
    if (m.responseItems) return m.responseItems;
    if (m.role === "tool") return [{ type: "function_call_output", call_id: m.tool_call_id, output: m.content }];
    const items: object[] = [];
    if (m.content)
      items.push({
        role: m.role === "system" ? "developer" : m.role,
        content:
          typeof m.content === "string"
            ? m.content
            : z
                .array(z.object({ type: z.string(), text: z.string().optional(), image_url: z.object({ url: z.string() }).optional() }))
                .parse(m.content)
                .map((p) => (p.type === "image_url" ? { type: "input_image", image_url: p.image_url!.url } : { type: "input_text", text: p.text })),
      });
    for (const call of m.tool_calls ?? [])
      items.push({ type: "function_call", call_id: call.id, namespace: "groat", name: call.function.name, arguments: call.function.arguments });
    return items;
  });
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${provider.key}`, "content-type": "application/json" },
    signal: AbortSignal.timeout(120000),
    body: JSON.stringify({
      model: parsed.model ?? provider.model,
      input,
      store: false,
      stream: true,
      ...(parsed.tools && {
        tools: [{ type: "namespace", name: "groat", description: "Groat ledger tools", tools: parsed.tools.map((t) => ({ type: "function", ...t.function, strict: false })) }],
      }),
      ...(parsed.tool_choice && { tool_choice: { type: "function", namespace: "groat", name: parsed.tool_choice.function.name } }),
    }),
  });
  if (!res.ok)
    throw new Error(
      res.status === 401 || res.status === 403 ? "ChatGPT needs you to sign in again. Open Settings and reconnect." : `ChatGPT returned an error (${res.status}). Try again.`,
    );
  if (!res.body) throw new Error("ChatGPT returned an empty stream. Try again.");
  let buffer = "";
  for await (const chunk of res.body.pipeThrough(new TextDecoderStream())) {
    buffer = (buffer + chunk).replace(/\r\n/g, "\n");
    let end: number;
    while ((end = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const data = frame
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trimStart())
        .join("\n");
      if (!data || data === "[DONE]") continue;
      const event = JSON.parse(data);
      if (["response.failed", "response.incomplete", "error"].includes(event.type))
        throw new Error("ChatGPT could not finish this response. Check your plan usage or reconnect in Settings, then try again.");
      if (event.type === "response.completed") {
        const reply = output.parse(event.response);
        const calls = reply.output.filter((o) => o.type === "function_call");
        if (calls.some((c) => c.namespace && c.namespace !== "groat")) throw new Error("ChatGPT returned an unknown tool");
        return {
          role: "assistant",
          responseItems: event.response.output as Record<string, unknown>[],
          content: reply.output
            .filter((o) => o.type === "message")
            .flatMap((m) => m.content.filter((p) => p.type === "output_text").map((p) => p.text ?? ""))
            .join(""),
          ...(calls.length && { tool_calls: calls.map((c) => ({ id: c.call_id, type: "function", function: { name: c.name, arguments: c.arguments } })) }),
        };
      }
    }
  }
  throw new Error("ChatGPT stopped before completing the response. Try again.");
}
