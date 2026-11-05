import { useState } from "react";
import { useIsMutating, useMutationState } from "@tanstack/react-query";
import { Button } from "../../components/button";
import { FormError } from "../../components/form";
import { panel } from "../../components/styles";
import { signOutDevice } from "../../query-client";

export function SignOut() {
  const unsent = useMutationState({ filters: { predicate: (m) => !!m.meta?.retained && m.state.status !== "success" } }).length;
  const sending = useIsMutating({ predicate: (m) => !m.state.isPaused });
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const leave = () => void signOutDevice().catch(() => setError(new Error("Couldn’t clear saved data on this device. Check browser storage and try again.")));
  return <div className={`${panel} mt-7 p-4`}>
    {confirm ? <>
      <p className="text-sm text-ink2">Unsent changes will be removed from this device. Stay signed in to sync them first.</p>
      <div className="mt-3 flex flex-wrap gap-3"><Button tone="up" onClick={leave}>Remove changes and sign out</Button><Button onClick={() => setConfirm(false)}>Stay signed in</Button></div>
    </> : <Button className="w-full" tone="up" disabled={sending > 0} onClick={() => unsent ? setConfirm(true) : leave()}>{sending ? "Waiting for changes to finish…" : "Sign out"}</Button>}
    <FormError error={error} className="mt-2" />
  </div>;
}
