import { type FormEvent, useEffect, useState } from "react";
import { formatAmount } from "../shared/amount";

type Message = { role: string; content: string | null };
export type Draft = { note: string; amount: number; currency: string; date: string; categoryId: number; tags: string[] };
type Chat = { id: number; title: string; messages?: Message[] };


export function ChatPage({ onDraft }: { onDraft: (d: Draft) => void }) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [open, setOpen] = useState<Chat | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const list = () =>
    fetch("/api/chats")
      .then((r) => r.json())
      .then(setChats);
  useEffect(() => {
    list();
  }, []);

  const show = (id: number) =>
    fetch(`/api/chats/${id}`)
      .then((r) => r.json())
      .then(setOpen);

  async function ask(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch(open ? `/api/chats/${open.id}/messages` : "/api/chats", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message }),
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) return setError(body.error);
    setMessage("");
    setOpen(body);
    list();
  }

  async function remove(id: number) {
    if (!confirm("Delete this chat?")) return;
    await fetch(`/api/chats/${id}`, { method: "DELETE" });
    if (open?.id === id) setOpen(null);
    list();
  }

  return (
    <div className="grid gap-4">
      <ul className="grid gap-1 text-sm">
        <li>
          <button onClick={() => setOpen(null)} className={open ? "text-zinc-500" : "font-semibold"}>
            + New chat
          </button>
        </li>
        {chats.map((c) => (
          <li key={c.id} className="flex justify-between gap-2">
            <button onClick={() => show(c.id)} className={`truncate text-left ${open?.id === c.id ? "font-semibold" : ""}`}>
              {c.title}
            </button>
            <button onClick={() => remove(c.id)} className="text-zinc-500" aria-label="Delete chat">
              ✕
            </button>
          </li>
        ))}
      </ul>
      <div className="grid gap-2">
        {open?.messages
          ?.filter((m) => m.content && (m.role !== "tool" || m.content.startsWith('{"draft"')))
          .map((m, i) => {
            if (m.role === "tool") {
              const { draft } = JSON.parse(m.content!) as { draft: Draft };
              return (
                <button key={i} onClick={() => onDraft(draft)} className="mr-8 rounded-lg border border-zinc-300 px-3 py-2 text-left dark:border-zinc-700">
                  Review draft: {draft.note}, {formatAmount(draft.amount, draft.currency)} {draft.currency}, {draft.date}
                </button>
              );
            }
            return (
              <p
                key={i}
                className={`whitespace-pre-wrap rounded-lg px-3 py-2 ${m.role === "user" ? "ml-8 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "mr-8 bg-zinc-100 dark:bg-zinc-800"}`}
              >
                {m.content}
              </p>
            );
          })}
        {busy && <p className="text-sm text-zinc-500">Thinking…</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
      <form onSubmit={ask} className="flex gap-2">
        <input
          className="input flex-1"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Ask about your spending"
          required
        />
        <button disabled={busy} className="rounded-lg bg-zinc-900 px-4 text-white dark:bg-zinc-100 dark:text-zinc-900">
          Ask
        </button>
      </form>
    </div>
  );
}
