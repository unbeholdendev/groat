import { useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { send } from "../../lib/api";
import { chat as chatSchema } from "../../lib/schemas";

export function useAsk(chat?: number) {
  const asking = useMutation({
    mutationKey: ["ask", chat || null],
    mutationFn: async (message: string) => chatSchema.parse(await send("POST", chat ? `/api/chats/${chat}/messages` : "/api/chats", { message })),
  });
  useEffect(() => asking.reset(), [chat]);
  return asking;
}

export type Asking = ReturnType<typeof useAsk>;
