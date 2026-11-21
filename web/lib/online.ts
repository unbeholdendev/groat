import { useSyncExternalStore } from "react";
import { onlineManager } from "@tanstack/react-query";

export const useOnline = () =>
  useSyncExternalStore(
    (f) => onlineManager.subscribe(f),
    () => onlineManager.isOnline(),
  );

let probe: ReturnType<typeof setInterval> | undefined;

export function unreachable() {
  onlineManager.setOnline(false);
  probe ??= setInterval(async () => {
    if (!onlineManager.isOnline()) {
      if (!navigator.onLine) return;
      const reached = await fetch("/api/session").then(
        () => true,
        () => false,
      );
      if (!reached) return;
      onlineManager.setOnline(true);
    }
    clearInterval(probe);
    probe = undefined;
  }, 3000);
}
