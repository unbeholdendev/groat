import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { FormError } from "../../components/form";
import { divide, panel } from "../../components/styles";
import { send, useApi } from "../../lib/api";
import { SettingsIcon } from "./settings-icon";

const reminders = z.object({
  publicKey: z.string(),
  reminders: z.array(z.object({ endpoint: z.string(), time: z.string() })),
});

const supported = typeof window !== "undefined" && "PushManager" in window && "serviceWorker" in navigator;
const unsupported =
  "This browser can’t show reminders. On iPhone or iPad, add Groat to the Home Screen and open it from there.";

const pushManager = async () => {
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration?.pushManager) throw new Error(unsupported);
  return registration.pushManager;
};

const base64url = (key: ArrayBuffer | null) =>
  key &&
  btoa(String.fromCharCode(...new Uint8Array(key)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");

export function Reminder() {
  const client = useQueryClient();
  const saved = useApi(reminders, ["/api/reminders"], { enabled: supported });
  const device = useQuery({
    queryKey: ["push-endpoint"],
    queryFn: async () => (await (await pushManager()).getSubscription())?.endpoint ?? null,
    enabled: supported,
  });
  const mine = saved.data?.reminders.find((r) => r.endpoint === device.data);
  const [draft, setDraft] = useState<string>();
  const time = draft ?? mine?.time ?? "20:00";

  const refresh = () => client.invalidateQueries({ queryKey: ["/api/reminders"] });
  const turnOn = useMutation({
    mutationFn: async (at: string) => {
      const manager = await pushManager();
      if ((await Notification.requestPermission()) !== "granted")
        throw new Error("Your browser blocks notifications from Groat. Allow them in browser or system settings.");
      const publicKey = saved.data?.publicKey;
      let subscription = await manager.getSubscription();
      if (subscription && base64url(subscription.options.applicationServerKey) !== publicKey) {
        await subscription.unsubscribe();
        subscription = null;
      }
      subscription ??= await manager.subscribe({ userVisibleOnly: true, applicationServerKey: publicKey });
      await send("PUT", "/api/reminders", {
        subscription: subscription.toJSON(),
        time: at,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      client.setQueryData(["push-endpoint"], subscription.endpoint);
    },
    onSettled: refresh,
  });
  const turnOff = useMutation({
    mutationFn: async () => {
      const subscription = await (await pushManager()).getSubscription();
      if (!subscription) return;
      await send("DELETE", "/api/reminders", { endpoint: subscription.endpoint });
      await subscription.unsubscribe();
      client.setQueryData(["push-endpoint"], null);
    },
    onSettled: refresh,
  });

  if (!supported) return <p className="px-1 text-ink2">{unsupported}</p>;
  const busy = turnOn.isPending || turnOff.isPending || !saved.data || device.isPending;
  return (
    <div className="flex flex-col">
      <div className={panel}>
        <label className={`flex h-[62px] items-center gap-3 px-4 ${divide}`}>
          <SettingsIcon>
            <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0" />
          </SettingsIcon>
          <span className="flex-1 font-medium">Remind me every day</span>
          <input
            type="checkbox"
            className="size-5 accent-accent"
            checked={!!mine}
            disabled={busy}
            onChange={(e) => (e.target.checked ? turnOn.mutate(time) : turnOff.mutate())}
          />
        </label>
        <label className={`flex h-[62px] items-center gap-3 px-4 ${divide}`}>
          <SettingsIcon>
            <circle cx="12" cy="12" r="8" />
            <path d="M12 8v4l3 2" />
          </SettingsIcon>
          <span className="flex-1 font-medium">Time</span>
          <input
            type="time"
            required
            className="input w-auto"
            value={time}
            disabled={busy}
            onChange={(e) => {
              setDraft(e.target.value);
              if (mine && e.target.value) turnOn.mutate(e.target.value);
            }}
          />
        </label>
      </div>
      <FormError error={saved.error ?? turnOn.error ?? turnOff.error} className="mt-2 px-1" />
      <p className="mt-2 px-1 text-[13px] text-ink2">
        Sends a notification to this device at this time every day. Each device has its own reminder.
      </p>
    </div>
  );
}
