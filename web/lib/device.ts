import { useSyncExternalStore } from "react";

let warning: string | null = null;
const listeners = new Set<() => void>();
export const isLocallySignedOut = () => {
  try { return localStorage.getItem("signed-out") === "1"; } catch { return false; }
};
const report = (value: string | null) => {
  if (value === warning) return;
  warning = value;
  listeners.forEach((f) => f());
};
export const useStorageWarning = () => useSyncExternalStore((f) => (listeners.add(f), () => { listeners.delete(f); }), () => warning);
export function storeCache(value: unknown) {
  try {
    localStorage.setItem("cache", JSON.stringify(value));
    report(null);
  } catch {
    report("Couldn’t save changes on this device. Keep this tab open and reconnect before closing it.");
  }
}
export function lockDevice() {
  localStorage.setItem("signed-out", "1");
  localStorage.removeItem("cache");
}
export const unlockDevice = () => localStorage.removeItem("signed-out");
