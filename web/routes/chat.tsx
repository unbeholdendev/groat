import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { money } from "../period";
import { Chevron, type Draft, pick } from "../shared";

type Message = { role: string; content: string | null };
export type Chat = { id: number; title: string; messages?: Message[] };

export const Route = createFileRoute("/chat")({
  validateSearch: (s) => pick(s, { id: /^\d+$/ }),
  component: ChatPage,
});

function ChatPage() {
  const navigate = useNavigate();
  const onDraft = (draft: Draft) => navigate({ to: "/", state: { draft } });
  const search = Route.useSearch();
  const openId = search.id ? Number(search.id) : null;
  const setOpenId = (id: number | null) => navigate({ to: "/chat", search: id ? { id: String(id) } : {} });
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
    <div className="grid gap-5">
      <div className="flex items-center justify-between">
        <button className="inline-flex items-center gap-1 text-ink2" onClick={() => (openId ? setOpenId(null) : navigate({ to: "/settings" }))}>
          <Chevron className="size-4 rotate-90 text-ink2" />
          {openId ? "Chats" : "Settings"}
        </button>
        {openId && (
          <button className="text-sm font-medium text-up" onClick={() => remove(openId)}>
            Delete
          </button>
        )}
      </div>
      <h1 className="text-[22px] font-semibold tracking-tight">{open?.title ?? "Chats"}</h1>
      {!openId && (
        <ul>
          {chats.length === 0 && <li className="text-ink3">No chats yet. Start one here, or type ? in the bar.</li>}
          {chats.map((c) => (
            <li key={c.id} className="border-b border-line last:border-0">
              <button onClick={() => setOpenId(c.id)} className="w-full truncate py-2.5 text-left">
                {c.title}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-2.5">
        {open?.messages
          ?.filter((m) => m.content && (m.role !== "tool" || m.content.startsWith('{"draft"')))
          .map((m, i) => {
            if (m.role === "tool") {
              const { draft } = JSON.parse(m.content!) as { draft: Draft };
              return (
                <button
                  key={i}
                  onClick={() => onDraft(draft)}
                  className="mr-8 flex justify-between gap-3 rounded-xl border border-line2 bg-surface px-3.5 py-2.5 text-left text-sm"
                >
                  <span>
                    Review draft: <b className="font-medium">{draft.note}</b>, {draft.date}
                  </span>
                  {money(draft.amount, draft.currency)}
                </button>
              );
            }
            return (
              <p
                key={i}
                className={`rounded-xl px-3.5 py-2.5 whitespace-pre-wrap ${m.role === "user" ? "ml-8 bg-accent-soft text-ink" : "mr-8 border border-line bg-surface"}`}
              >
                {m.content}
              </p>
            );
          })}
        {asking.isPending && <p className="text-sm text-ink3">Looking at your expenses…</p>}
        {asking.error && <p className="text-sm text-up">{asking.error.message}</p>}
      </div>
      <form onSubmit={ask} className="flex gap-2">
        <input
          className="input flex-1"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={openId ? "Reply" : "Ask about your spending"}
          required
        />
        <button disabled={asking.isPending} className="primary">
          {openId ? "Send" : "Ask"}
        </button>
      </form>
    </div>
  );
}
