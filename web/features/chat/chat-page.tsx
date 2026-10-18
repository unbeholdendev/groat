import { useEffect } from "react";
import { useMutation, useMutationState } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { FormError } from "../../components/form";
import { send, useApi } from "../../lib/api";
import { type Chat, chat as chatSchema } from "../../lib/schemas";
import { ChatHeader } from "./chat-header";
import { ChatList } from "./chat-list";
import { Messages } from "./messages";

export function ChatPage({ openId }: { openId: number | null }) {
  const navigate = useNavigate();
  const setOpenId = (id: number | null) => navigate({ to: "/chat", search: id ? { id: String(id) } : {} });
  const chats = useApi(z.array(chatSchema), ["/api/chats"], { throwOnError: true }).data ?? [];
  const chat = useApi(chatSchema, [`/api/chats/${openId}`], { enabled: openId !== null }).data;
  const open = openId === null ? null : chat;
  const asking = useMutationState({ filters: { mutationKey: ["ask", openId], status: "pending" }, select: (m) => (typeof m.state.variables === "string" ? m.state.variables : undefined) })[0];
  const messages = [...(open?.messages ?? []), ...(asking ? [{ role: "user", content: asking }] : [])];
  useEffect(() => void (openId && scrollTo(0, document.body.scrollHeight)), [messages.length]);
  const deleting = useMutation({
    mutationFn: (id: number) => send("DELETE", `/api/chats/${id}`),
    onSuccess: (_, id, __, { client }) => client.setQueryData<Chat[]>(["/api/chats"], (rows) => rows?.filter((c) => c.id !== id)),
  });

  return (
    <div className="grid gap-5">
      <ChatHeader
        open={!!openId}
        onBack={() => (openId ? setOpenId(null) : navigate({ to: "/settings" }))}
        onDelete={() => openId && (setOpenId(null), deleting.mutate(openId))}
      />
      <FormError error={deleting.error} />
      <h1 className="text-display font-bold text-balance">{open?.title ?? "Chats"}</h1>
      {!openId && <ChatList chats={chats} onOpen={setOpenId} />}
      <Messages messages={messages} asking={asking} onDraft={(draft) => navigate({ to: "/", search: { new: "1" }, state: { draft } })} />
    </div>
  );
}
