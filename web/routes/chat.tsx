import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { formatAmount } from "../../shared/amount";
import type { Draft } from "../shared";

type Message = { role: string; content: string | null };
type Chat = { id: number; title: string; messages?: Message[] };

export const Route = createFileRoute("/chat")({ component: ChatPage });

function ChatPage() {
  const navigate = useNavigate();
  const onDraft = (draft: Draft) => navigate({ to: "/", state: { draft } });
  const [openId, setOpenId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const chats = useQuery<Chat[]>({ queryKey: ["/api/chats"] }).data ?? [];
  const chat = useQuery<Chat>({ queryKey: [`/api/chats/${openId}`], enabled: openId !== null }).data;
  const open = openId === null ? null : chat;

  const asking = useMutation({
    mutationFn: async () => {
      const res = await fetch(openId ? `/api/chats/${openId}/messages` : "/api/chats", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      return body as Chat;
    },
    onSuccess: (body) => {
      setMessage("");
      setOpenId(body.id);
    },
  });
  const deleting = useMutation({ mutationFn: (id: number) => fetch(`/api/chats/${id}`, { method: "DELETE" }) });

  function ask(e: FormEvent) {
    e.preventDefault();
    asking.mutate();
  }

  function remove(id: number) {
    if (!confirm("Delete this chat?")) return;
    if (openId === id) setOpenId(null);
    deleting.mutate(id);
  }

  return (
    <div className="grid gap-4">
      <ul className="grid gap-1 text-sm">
        <li>
          <button onClick={() => setOpenId(null)} className={openId ? "text-zinc-500" : "font-semibold"}>
            + New chat
          </button>
        </li>
        {chats.map((c) => (
          <li key={c.id} className="flex justify-between gap-2">
            <button onClick={() => setOpenId(c.id)} className={`truncate text-left ${openId === c.id ? "font-semibold" : ""}`}>
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
        {asking.isPending && <p className="text-sm text-zinc-500">Thinking…</p>}
        {asking.error && <p className="text-sm text-red-600">{asking.error.message}</p>}
      </div>
      <form onSubmit={ask} className="flex gap-2">
        <input
          className="input flex-1"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Ask about your spending"
          required
        />
        <button disabled={asking.isPending} className="rounded-lg bg-zinc-900 px-4 text-white dark:bg-zinc-100 dark:text-zinc-900">
          Ask
        </button>
      </form>
    </div>
  );
}
