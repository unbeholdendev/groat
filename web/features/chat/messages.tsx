import { use } from "react";
import { DraftCard } from "../../components/draft-card";
import { type Draft, draftIn } from "../../lib/schemas";
import { UnitContext } from "../../lib/unit";

type Message = { role: string; content?: string | null };

export function Messages({ messages, asking, onDraft }: { messages: Message[]; asking?: string; onDraft: (draft: Draft) => void }) {
  const [unit] = use(UnitContext);
  return (
    <div className="grid gap-2.5">
      {messages
        .filter((m) => m.content && (m.role !== "tool" || m.content.startsWith('{"draft"')))
        .map((m, i) => {
          if (m.role === "tool") {
            const draft = draftIn(m.content);
            return draft && <DraftCard key={i} draft={draft} unit={unit} className="mr-8 bg-surface text-sm shadow-panel" onClick={() => onDraft(draft)} />;
          }
          return (
            <p
              key={i}
              className={`rise px-4 py-2.5 whitespace-pre-wrap ${m.role === "user" ? "ml-10 justify-self-end rounded-[20px] rounded-br-md bg-surface2" : "mr-10 justify-self-start rounded-[20px] rounded-bl-md bg-surface shadow-panel"}`}
            >
              {m.content}
            </p>
          );
        })}
      {asking && <p className="mr-10 justify-self-start rounded-[20px] rounded-bl-md bg-surface px-4 py-2.5 text-ink3 shadow-panel">Working on it…</p>}
    </div>
  );
}
