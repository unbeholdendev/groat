import { Chevron } from "../../components/icon";
import { divide, panel } from "../../components/styles";
import type { Chat } from "../../lib/schemas";

export const ChatList = ({ chats, onOpen }: { chats: Chat[]; onOpen: (id: number) => void }) =>
  chats.length === 0 ? (
    <p className="text-ink3">No chats yet.</p>
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
