import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { send, useApi } from "../../lib/api";
import { type Chat, chat } from "../../lib/schemas";

export const useUnread = () => useApi(z.array(chat), ["/api/chats"]).data?.filter((c) => c.unread) ?? [];

export const useMarkRead = () =>
  useMutation({
    mutationFn: (id: number) => send("POST", `/api/chats/${id}/read`),
    onSuccess: (_, id, __, { client }) =>
      client.setQueryData<Chat[]>(["/api/chats"], (rows) =>
        rows?.map((c) => (c.id === id ? { ...c, unread: false } : c)),
      ),
  });

export const Dot = ({ className = "" }: { className?: string }) => (
  <span role="img" aria-label="Unread" className={`size-2 shrink-0 rounded-full bg-accent ${className}`} />
);
