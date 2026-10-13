import { useMutation, useMutationState, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useContext, useEffect, useState } from "react";
import { money } from "../period";
import { Chevron, Confirm, dayLabel, type Draft, pick, UnitContext } from "../shared";

type Message = { role: string; content: string | null };
export type Chat = { id: number; title: string; messages?: Message[] };

export const Route = createFileRoute("/chat")({
  validateSearch: (s) => pick(s, { id: /^\d+$/ }),
  component: ChatPage,
});

function ChatPage() {
  const [unit] = useContext(UnitContext);
  const navigate = useNavigate();
  const onDraft = (draft: Draft) => navigate({ to: "/", search: { new: "1" }, state: { draft } });
  const search = Route.useSearch();
  const openId = search.id ? Number(search.id) : null;
  const setOpenId = (id: number | null) => navigate({ to: "/chat", search: id ? { id: String(id) } : {} });
  const chats = useQuery<Chat[]>({ queryKey: ["/api/chats"], throwOnError: true }).data ?? [];
  const chat = useQuery<Chat>({ queryKey: [`/api/chats/${openId}`], enabled: openId !== null }).data;
  const open = openId === null ? null : chat;
  const asking = useMutationState({ filters: { mutationKey: ["ask", openId], status: "pending" }, select: (m) => m.state.variables as string })[0];
  const messages = [...(open?.messages ?? []), ...(asking ? [{ role: "user", content: asking }] : [])];
  useEffect(() => void (openId && scrollTo(0, document.body.scrollHeight)), [messages.length]);
  const deleting = useMutation({ mutationFn: (id: number) => fetch(`/api/chats/${id}`, { method: "DELETE" }) });
  const [confirming, setConfirming] = useState(false);

  function remove(id: number) {
    setConfirming(false);
    setOpenId(null);
    deleting.mutate(id);
  }

  return (
    <div className="grid gap-5">
      <div className="flex items-center justify-between">
        <button className="hit inline-flex items-center gap-1 text-ink2" onClick={() => (openId ? setOpenId(null) : navigate({ to: "/settings" }))}>
          <Chevron className="size-4 rotate-90 text-ink2" />
          {openId ? "Chats" : "Settings"}
        </button>
        {openId &&
          (confirming ? (
            <Confirm ask="Delete this chat?" yes="Delete" onYes={() => remove(openId)} onNo={() => setConfirming(false)} />
          ) : (
            <button className="hit text-sm font-medium text-up" onClick={() => setConfirming(true)}>
              Delete
            </button>
          ))}
      </div>
      <h1 className="text-[22px] font-semibold tracking-tight">{open?.title ?? "Chats"}</h1>
      {!openId && (
        <ul>
          {chats.length === 0 && <li className="text-ink3">No chats yet. Ask below to start one.</li>}
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
        {messages
          .filter((m) => m.content && (m.role !== "tool" || m.content.startsWith('{"draft"')))
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
                    Review draft: <b className="font-medium">{draft.note}</b>, {dayLabel(draft.date)}
                  </span>
                  <span className="whitespace-nowrap">{money(draft.amount, draft.currency, unit)}</span>
                </button>
              );
            }
            return (
              <p
                key={i}
                className={`rounded-xl px-3.5 py-2.5 whitespace-pre-wrap ${m.role === "user" ? "ml-8 border border-line bg-track" : "mr-8 border border-line bg-surface"}`}
              >
                {m.content}
              </p>
            );
          })}
        {asking && <p className="text-sm text-ink3">Looking at your expenses…</p>}
      </div>
    </div>
  );
}
