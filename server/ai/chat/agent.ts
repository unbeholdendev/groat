import { HTTPException } from "hono/http-exception";
import type { Ctx } from "../../context";
import { errorKind, log } from "../../logging";
import { chatActions } from "./actions";
import type { Message } from "./message";
import { createChat, findChat, saveMessage } from "./store";
import { readTools, systemPrompt, type Tool } from "./tools";

export function chatAgent(ctx: Ctx) {
  const { db, ai } = ctx;
  const runs = new Map<number, AbortController>();
  const save = (chatId: number, message: object) => saveMessage(db, chatId, message);
  const tools = readTools(ctx);

  const chat = (id: number | string) => {
    const found = findChat(db, id);
    return found && { ...found.row, running: runs.has(found.row.id), messages: found.messages };
  };

  const answer = async (id: number, history: Message[], cookie: string, run: AbortController) => {
    const { signal } = run;
    const actions = chatActions(ctx, cookie);
    const available: Record<string, Tool> = { ...tools, ...actions };
    const results = new Map<string, unknown>();
    const added: Message[] = [];
    const step = ({ modelMessage, ...message }: Message) => {
      if (runs.get(id) !== run) throw new Error("Chat deleted");
      added.push({ modelMessage, ...message });
      save(id, message);
      ctx.broadcast({ type: "chat", id });
    };
    try {
      for (let turn = 0; turn < 25; turn++) {
        const at = history.length + added.length;
        step(
          await ai.complete(
            {
              messages: [{ role: "system", content: systemPrompt(ctx) }, ...history, ...added],
              tools: Object.entries(available).map(([name, { description, parameters }]) => ({
                type: "function",
                function: { name, description, parameters },
              })),
            },
            "chat",
            { signal, onText: (text) => ctx.broadcast({ type: "chat", id, at, text }) },
          ),
        );
        const calls = added.at(-1)?.tool_calls;
        if (!calls?.length) return;
        for (const { id: callId, function: f } of calls) {
          signal.throwIfAborted();
          const mutates = f.name in actions && f.name !== "list_recurring";
          const operation = Object.hasOwn(available, f.name) ? f.name : "unknown";
          const result =
            mutates && results.has(callId)
              ? results.get(callId)
              : await Promise.resolve()
                  .then(() => {
                    const selected = available[f.name];
                    if (!selected) throw new Error("Unsupported action");
                    const args = JSON.parse(f.arguments);
                    log("debug", "ai.tool.started", { operation });
                    return selected.run(args);
                  })
                  .then((result) => {
                    log("debug", "ai.tool.completed", { operation });
                    return result;
                  })
                  .catch((e) => {
                    log("warn", "ai.tool.failed", { operation, error: errorKind(e) });
                    if (e instanceof HTTPException && e.status === 401) throw e;
                    return { error: String(e) };
                  });
          if (mutates) results.set(callId, result);
          step({ role: "tool", tool_call_id: callId, content: JSON.stringify(result) });
        }
      }
      step({
        role: "assistant",
        content: "I reached the tool limit. Check the steps above before requesting another change.",
      });
    } catch (error) {
      if (!signal.aborted) log("warn", "ai.reply.failed", { error: errorKind(error) });
      step({ role: "assistant", content: failure(error, signal.aborted) });
    }
  };

  const ask = (chatId: number | null, message: string, cookie: string) => {
    const history = (chatId && chat(chatId)?.messages) || [];
    const question = { role: "user", content: message };
    const id = db.transaction(() => {
      const id = chatId ?? createChat(db, message.slice(0, 60));
      save(id, question);
      return id;
    });
    const run = new AbortController();
    runs.set(id, run);
    answer(id, [...history, question], cookie, run)
      .catch((error) => log("warn", "ai.run.failed", { error: errorKind(error) }))
      .finally(() => {
        if (runs.get(id) !== run) return;
        runs.delete(id);
        ctx.broadcast({ type: "chat", id });
      });
    return chat(id);
  };

  return {
    chat,
    ask,
    running: (id: number) => runs.has(id),
    stop: (id: number) => runs.get(id)?.abort(),
    forget: (id: number) => {
      runs.get(id)?.abort();
      runs.delete(id);
    },
  };
}

function failure(error: unknown, aborted: boolean) {
  if (aborted) return "Stopped.";
  if (error instanceof HTTPException) return error.message;
  return "The AI provider sent an unexpected reply";
}
