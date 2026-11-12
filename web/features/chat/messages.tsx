import { Fragment, use } from "react";
import { Button } from "../../components/button";
import { DraftCard } from "../../components/draft-card";
import { type ChatMessage, type Draft, draftIn } from "../../lib/schemas";
import { UnitContext } from "../../lib/unit";

const reply =
  "rise mr-10 justify-self-start rounded-[20px] rounded-bl-md bg-surface px-4 py-2.5 whitespace-pre-wrap wrap-anywhere shadow-panel";
const label = (name: string) => name.charAt(0).toUpperCase() + name.slice(1).replaceAll("_", " ");

export function Messages({
  messages,
  running,
  streamed,
  onStop,
  onDraft,
}: {
  messages: ChatMessage[];
  running: boolean;
  streamed: string;
  onStop?: () => void;
  onDraft: (draft: Draft) => void;
}) {
  const [unit] = use(UnitContext);
  const results = new Map(
    messages.flatMap((m) => (m.role === "tool" && m.tool_call_id ? [[m.tool_call_id, m.content ?? ""] as const] : [])),
  );
  const acting = messages.some((m) => m.tool_calls?.some((c) => !results.has(c.id)));
  return (
    <div className="grid gap-2.5">
      {messages.map((m, i) => {
        if (m.role === "tool") {
          const draft = m.content?.startsWith('{"draft"') && draftIn(m.content);
          return (
            draft && (
              <DraftCard
                key={i}
                draft={draft}
                unit={unit}
                className="mr-8 bg-surface text-sm shadow-panel"
                onClick={() => onDraft(draft)}
              />
            )
          );
        }
        return (
          <Fragment key={i}>
            {m.content && (
              <p
                className={
                  m.role === "user"
                    ? "rise ml-10 justify-self-end rounded-[20px] rounded-br-md bg-surface2 px-4 py-2.5 whitespace-pre-wrap wrap-anywhere"
                    : reply
                }
              >
                {m.content}
              </p>
            )}
            {m.tool_calls?.map((c) => {
              const result = results.get(c.id);
              const state =
                result === undefined
                  ? running
                    ? "…"
                    : ": not run"
                  : result.startsWith('{"error"')
                    ? ": failed"
                    : " ✓";
              return (
                <p key={c.id} className="mr-10 justify-self-start px-4 text-sm text-ink3">
                  {label(c.function.name)}
                  {state}
                </p>
              );
            })}
          </Fragment>
        );
      })}
      {running &&
        (streamed ? (
          <p className={reply}>{streamed}</p>
        ) : (
          !acting && <p className={`${reply} text-ink3`}>Working on it…</p>
        ))}
      {running && onStop && (
        <Button className="justify-self-start" onClick={onStop}>
          Stop
        </Button>
      )}
    </div>
  );
}
