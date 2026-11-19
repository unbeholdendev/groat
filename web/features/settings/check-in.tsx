import { useMutation } from "@tanstack/react-query";
import { Button } from "../../components/button";
import { FormError } from "../../components/form";
import { divide, panel, subHead } from "../../components/styles";
import { send, useSendNow, useSettings } from "../../lib/api";
import { SettingsIcon } from "./settings-icon";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export function CheckIn() {
  const settings = useSettings()!;
  const toggle = useSendNow("settings");
  const checking = useMutation({ mutationFn: () => send("POST", "/api/check-in") as Promise<{ id: number | null }> });
  const on = settings.checkIns;
  return (
    <div className="flex flex-col">
      <h2 className={`${subHead} mb-3`}>Weekly check-in</h2>
      <div className={panel}>
        <label className={`flex h-[62px] items-center gap-3 px-4 ${divide}`}>
          <SettingsIcon>
            <path d="M5 6h14v13H5zM5 10h14M9 4v4M15 4v4" />
          </SettingsIcon>
          <span className="flex-1 font-medium">Check in every week</span>
          <input
            type="checkbox"
            className="size-5 accent-accent"
            checked={on}
            disabled={toggle.isPending}
            onChange={(e) => toggle.mutate(["PUT", "/api/settings", { checkIns: e.target.checked }])}
          />
        </label>
        <div className={`flex h-[62px] items-center gap-3 px-4 ${divide}`}>
          <span className="flex-1 text-ink2">
            {settings.lastCheckInAt ? `Last checked ${day(settings.lastCheckInAt)}` : "Not checked yet"}
          </span>
          <Button tone="accent" disabled={checking.isPending} onClick={() => checking.mutate()}>
            {checking.isPending ? "Checking…" : "Check now"}
          </Button>
        </div>
      </div>
      <FormError error={toggle.error ?? checking.error} className="mt-2 px-1" />
      <p className="mt-2 px-1 text-[13px] text-ink2">
        {checking.data?.id === null
          ? "Nothing notable this time."
          : "The AI looks over your spending and posts anything notable as a chat for everyone."}
      </p>
    </div>
  );
}
