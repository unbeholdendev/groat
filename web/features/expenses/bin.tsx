import { useState } from "react";
import { z } from "zod";
import { BackToSettings } from "../../components/back-link";
import { Button } from "../../components/button";
import { Confirm } from "../../components/confirm";
import { FormError } from "../../components/form";
import { divide, panel } from "../../components/styles";
import { useApi, useSend } from "../../lib/api";
import { expense } from "../../lib/schemas";
import { ExpenseRow, rowClass } from "./expense-row";

export function Bin() {
  const query = useApi(z.array(expense), ["/api/bin"], { throwOnError: false });
  const bin = query.data;
  const [asking, setAsking] = useState(false);
  const empty = useSend("bin");
  const restore = useSend("expense");
  if (!bin) return <><BackToSettings /><h1 className="mt-4 text-display font-bold">Bin</h1>{query.isPending && <p role="status">Loading bin…</p>}<FormError error={query.error} />{query.isError && <Button onClick={() => void query.refetch()}>Try again</Button>}</>;
  return (
    <>
      <div className="flex items-center justify-between">
        <BackToSettings />
        {asking ? (
          <Confirm
            ask={`Delete ${bin.length} ${bin.length === 1 ? "expense" : "expenses"} for good?`}
            yes="Delete"
            onYes={() => (setAsking(false), empty.mutate(["DELETE", "/api/bin"]))}
            onNo={() => setAsking(false)}
          />
        ) : (
          bin.length > 0 && (
            <Button variant="link" tone="up" className="text-sm" onClick={() => setAsking(true)}>
              Empty bin
            </Button>
          )
        )}
      </div>
      <h1 className="mt-4 text-display font-bold">Bin</h1>
      <FormError error={query.error} />
      {query.isError && <Button onClick={() => void query.refetch()}>Try again</Button>}
      <FormError error={empty.error ?? restore.error} className="mt-4" />
      {bin.length === 0 && <p className="mt-4 text-ink3">The bin is empty.</p>}
      {bin.length > 0 && (
        <ul className={`mt-4 ${panel}`}>
          {bin.map((e) => (
            <li key={e.id} className={`${rowClass} ${divide}`}>
              <ExpenseRow expense={e} dated />
              <Button variant="quiet" className="hit h-8 px-3 text-[13px]" onClick={() => restore.mutate(["POST", `/api/bin/${e.id}/restore`])}>
                Restore
              </Button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
