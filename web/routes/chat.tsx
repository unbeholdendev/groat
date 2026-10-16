import { useMutation, useMutationState } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useContext, useEffect, useState } from "react";
import { money } from "../period";
import { chat as chatSchema, type Draft, draftIn, useApi } from "../api";
import { z } from "zod";
import { dayLabel, pick } from "../dates";
import { Chevron, Confirm, divide, panel, UnitContext } from "../ui";


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
  const chats = useApi(z.array(chatSchema), ["/api/chats"], { throwOnError: true }).data ?? [];
  const chat = useApi(chatSchema, [`/api/chats/${openId}`], { enabled: openId !== null }).data;
  const open = openId === null ? null : chat;
  const asking = useMutationState({ filters: { mutationKey: ["ask", openId], status: "pending" }, select: (m) => (typeof m.state.variables === "string" ? m.state.variables : undefined) })[0];
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
      <h1 className="text-display font-bold text-balance">{open?.title ?? "Chats"}</h1>
      {!openId && (
        chats.length === 0 ? (
          <p className="text-ink3">No chats yet. Ask below to start one.</p>
        ) : (
          <ul className={panel}>
            {chats.map((c) => (
              <li key={c.id} className={divide}>
                <button onClick={() => setOpenId(c.id)} className="press flex h-[52px] w-full items-center gap-3 px-4 text-left font-medium hover:bg-surface2">
                  <span className="min-w-0 flex-1 truncate">{c.title}</span>
                  <Chevron className="size-4 -rotate-90 text-ink3" />
                </button>
              </li>
            ))}
          </ul>
        )
      )}
      <div className="grid gap-2.5">
        {messages
          .filter((m) => m.content && (m.role !== "tool" || m.content.startsWith('{"draft"')))
          .map((m, i) => {
            if (m.role === "tool") {
              const draft = draftIn(m.content);
              if (!draft) return null;
              return (
                <button
                  key={i}
                  onClick={() => onDraft(draft)}
                  className="press mr-8 flex justify-between gap-3 rounded-field bg-surface px-3.5 py-2.5 text-left text-sm shadow-panel"
                >
                  <span>
                    Review draft: <b className="font-medium">{draft.note}</b>, {dayLabel(draft.date)}
                  </span>
                  <span className="num whitespace-nowrap">{money(draft.amount, draft.currency, unit)}</span>
                </button>
              );
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
        {asking && <p className="mr-10 justify-self-start rounded-[20px] rounded-bl-md bg-surface px-4 py-2.5 text-ink3 shadow-panel">Looking at your expenses…</p>}
      </div>
    </div>
  );
}
