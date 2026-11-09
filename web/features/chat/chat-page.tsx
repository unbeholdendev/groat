import { useEffect } from "react";
import { useMutation, useMutationState } from "@tanstack/react-query";
import { useCanGoBack, useLocation, useNavigate, useRouter } from "@tanstack/react-router";
import { z } from "zod";
import { FormError } from "../../components/form";
import { send, useApi } from "../../lib/api";
import { type Chat, chat as chatSchema } from "../../lib/schemas";
import { ChatHeader } from "./chat-header";
import { ChatList } from "./chat-list";
import { Messages } from "./messages";

export function ChatPage({ openId }: { openId: number | null }) {
  const navigate = useNavigate();
  const { history } = useRouter();
  const canGoBack = useCanGoBack();
  const { fromList } = useLocation().state;
  const back = () => (openId && !fromList ? navigate({ to: "/chat", replace: true }) : canGoBack ? history.back() : navigate({ to: "/" }));
  const chats = useApi(z.array(chatSchema), ["/api/chats"], { throwOnError: true }).data ?? [];
  const { data: chat, error } = useApi(chatSchema, [`/api/chats/${openId}`], { enabled: openId !== null });
  const open = openId === null ? null : chat;
  const missing = !!openId && !!error && "status" in error && error.status === 404;
  const asking = useMutationState({ filters: { mutationKey: ["ask", openId], status: "pending" }, select: (m) => (typeof m.state.variables === "string" ? m.state.variables : undefined) })[0];
  const messages = [...(open?.messages ?? []), ...(asking ? [{ role: "user", content: asking }] : [])];
  useEffect(() => {
    const main = document.querySelector("main");
    if (openId) main?.scrollTo(0, main.scrollHeight);
  }, [messages.length]);
  const deleting = useMutation({
    mutationFn: (id: number) => send("DELETE", `/api/chats/${id}`),
    onSuccess: (_, id, __, { client }) => client.setQueryData<Chat[]>(["/api/chats"], (rows) => rows?.filter((c) => c.id !== id)),
  });

  return (
    <div className="grid gap-5">
      <ChatHeader back={openId ? "Chats" : "Back"} onBack={back} onDelete={open ? () => (back(), deleting.mutate(open.id)) : undefined} />
      <FormError error={deleting.error ?? (missing ? null : error)} />
      <div>
        <h1 className="text-display font-bold text-balance">{missing ? "Chat not found" : (open?.title ?? "Chats")}</h1>
        {missing && <p className="mt-2 text-ink2">It may have been deleted.</p>}
      </div>
      {!openId && <ChatList chats={chats} onOpen={(id) => navigate({ to: "/chat", search: { id: String(id) }, state: { fromList: true } })} />}
      <Messages messages={messages} asking={asking} onDraft={(draft) => navigate({ to: "/", search: { new: "1" }, state: { draft } })} />
    </div>
  );
}
