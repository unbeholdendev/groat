import { useEffect, useRef } from "react";
import type { Unit } from "../../../shared/amount";
import { Button } from "../../components/button";
import { DraftCard } from "../../components/draft-card";
import { useApi } from "../../lib/api";
import { type Draft, chat as chatSchema, draftIn } from "../../lib/schemas";
import { useStreamed } from "../../lib/streams";
import type { Asking } from "./use-ask";

export function AnswerCard({
  asking,
  unit,
  onClose,
  onForm,
  onChat,
}: {
  asking: Asking;
  unit: Unit;
  onClose: () => void;
  onForm: (d: Draft) => void;
  onChat: (id: number) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const id = asking.data?.id;
  const chat = useApi(chatSchema, [`/api/chats/${id}`], { enabled: id !== undefined }).data ?? asking.data;
  const pending = asking.isPending || !!chat?.running;
  const streamed = useStreamed(id, chat?.messages?.length ?? 0);
  const answer = streamed || chat?.messages?.findLast((m) => m.role === "assistant" && m.content)?.content;
  const drafts = (chat?.messages ?? [])
    .filter((m) => m.role === "tool" && m.content?.startsWith('{"draft"'))
    .flatMap((m) => draftIn(m.content) ?? []);
  return (
    <section
      ref={ref}
      tabIndex={-1}
      aria-live="polite"
      className="rise max-h-[55dvh] overflow-y-auto rounded-card bg-surface px-5 pt-[18px] pb-2.5 shadow-lift outline-none"
    >
      <p
        className={`text-[17px] leading-snug font-medium whitespace-pre-wrap ${pending && !answer ? "text-ink3" : ""}`}
      >
        {(asking.error && (asking.error.message || "Couldn’t reach the AI service. Try again.")) ||
          answer ||
          (pending ? "Working on it…" : "No answer came back.")}
      </p>
      {drafts.map((d, i) => (
        <DraftCard
          key={i}
          draft={d}
          unit={unit}
          className="mt-3 w-full bg-surface2"
          onClick={() => (onForm(d), asking.reset())}
        />
      ))}
      <div className="mt-3 flex justify-end gap-1 border-t border-line pt-1.5">
        <Button onClick={onClose}>Close</Button>
        {asking.error && (
          <Button tone="accent" onClick={() => asking.variables && asking.mutate(asking.variables)}>
            Try again
          </Button>
        )}
        {chat && (
          <Button tone="accent" onClick={() => onChat(chat.id)}>
            Continue in chat
          </Button>
        )}
      </div>
    </section>
  );
}
