import { useSyncExternalStore } from "react";
import { onlineManager } from "@tanstack/react-query";

export const useOnline = () => useSyncExternalStore((f) => onlineManager.subscribe(f), () => onlineManager.isOnline());
