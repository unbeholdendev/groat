import { useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { send } from "../../lib/api";
import { type Chat, chat as chatSchema } from "../../lib/schemas";

export function useAsk(chat?: number) {
  const asking = useMutation({
    mutationKey: ["ask", chat || null],
    mutationFn: async (message: string) => chatSchema.parse(await send("POST", chat ? `/api/chats/${chat}/messages` : "/api/chats", { message })),
    onSuccess: (c, _, __, { client }) => {
      client.setQueryData([`/api/chats/${c.id}`], c);
      client.setQueryData<Chat[]>(["/api/chats"], (rows) => rows && (rows.some((r) => r.id === c.id) ? rows : [{ id: c.id, title: c.title }, ...rows]));
    },
  });
  useEffect(() => asking.reset(), [chat]);
  return asking;
}

export type Asking = ReturnType<typeof useAsk>;
