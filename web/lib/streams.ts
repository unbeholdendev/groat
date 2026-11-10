import { useSyncExternalStore } from "react";

const replies = new Map<number, { at: number; text: string }>();
const listeners = new Set<() => void>();

export function stream(id: number, at: number, text: string) {
  replies.set(id, { at, text });
  listeners.forEach((f) => f());
}

export const useStreamed = (id: number | undefined, saved: number) =>
  useSyncExternalStore(
    (f) => (listeners.add(f), () => { listeners.delete(f); }),
    () => {
      const reply = id === undefined ? undefined : replies.get(id);
      return reply?.at === saved ? reply.text : "";
    },
  );
