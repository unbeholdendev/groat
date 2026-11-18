import { useEffect, useRef } from "react";
import type { Unit } from "../../../shared/amount";
import { Button } from "../../components/button";
import { EntryCard } from "../../components/entry-card";
import { RichText } from "../../components/rich-text";
import { useApi } from "../../lib/api";
import { type Draft, chat as chatSchema, draftIn, savedBy, type Transaction } from "../../lib/schemas";
import { useStreamed } from "../../lib/streams";
import type { Asking } from "./use-ask";

export function AnswerCard({
  asking,
  unit,
  onClose,
  onForm,
  onOpen,
  onChat,
}: {
  asking: Asking;
  unit: Unit;
  onClose: () => void;
  onForm: (d: Draft) => void;
  onOpen: (t: Transaction) => void;
  onChat: (id: number) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const id = asking.data?.id;
  const chat = useApi(chatSchema, [`/api/chats/${id}`], { enabled: id !== undefined }).data ?? asking.data;
  const pending = asking.isPending || !!chat?.running;
  const streamed = useStreamed(id, chat?.messages?.length ?? 0);
  const answer = streamed || chat?.messages?.findLast((m) => m.role === "assistant" && m.content)?.content;
  const messages = chat?.messages ?? [];
  const tools = messages.filter((m) => m.role === "tool");
  const drafts = tools.flatMap((m) => draftIn(m.content) ?? []);
  const savedIn = savedBy(messages);
  const saved = tools.flatMap((m) => savedIn(m) ?? []);
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
          (answer && <RichText text={answer} />) ||
          (pending ? "Working on it…" : "No answer came back.")}
      </p>
      {drafts.map((d, i) => (
        <EntryCard
          key={i}
          label="Review draft"
          entry={d}
          unit={unit}
          className="mt-3 w-full bg-surface2"
          onClick={() => {
            onForm(d);
            asking.reset();
          }}
        />
      ))}
      {saved.map((t, i) => (
        <EntryCard
          key={i}
          label="Saved"
          entry={t}
          unit={unit}
          className="mt-3 w-full bg-surface2"
          onClick={() => {
            onOpen(t);
            asking.reset();
          }}
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
