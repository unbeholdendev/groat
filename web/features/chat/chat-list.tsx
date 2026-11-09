import { Chevron } from "../../components/icon";
import { divide, panel } from "../../components/styles";
import { useSettings } from "../../lib/api";
import type { Chat } from "../../lib/schemas";

export function ChatList({ chats, onOpen }: { chats: Chat[]; onOpen: (id: number) => void }) {
  const ai = useSettings()?.ai;
  return chats.length === 0 ? (
    <p className="text-ink3">{ai ? "No chats yet. Ask about your spending in the bar below. On other pages, start a line with ? to ask." : "No chats yet."}</p>
  ) : (
    <ul className={panel}>
      {chats.map((c) => (
        <li key={c.id} className={divide}>
          <button type="button" onClick={() => onOpen(c.id)} className="press flex h-[52px] w-full items-center gap-3 px-4 text-left font-medium hover:bg-surface2">
            <span className="min-w-0 flex-1 truncate">{c.title}</span>
            <Chevron className="size-4 -rotate-90 text-ink3" />
          </button>
        </li>
      ))}
    </ul>
  );
}
