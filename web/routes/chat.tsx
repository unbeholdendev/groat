import { createFileRoute } from "@tanstack/react-router";
import { pick } from "../lib/dates";
import { ChatPage } from "../features/chat/chat-page";

export const Route = createFileRoute("/chat")({
  validateSearch: (s) => pick(s, { id: /^\d+$/ }),
  component: () => {
    const { id } = Route.useSearch();
    return <ChatPage openId={id ? Number(id) : null} />;
  },
});
