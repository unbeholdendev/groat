import { useState } from "react";
import { z } from "zod";
import { BackToSettings } from "../../components/back-link";
import { Button } from "../../components/button";
import { Confirm } from "../../components/confirm";
import { divide, panel } from "../../components/styles";
import { useApi, useSend } from "../../lib/api";
import { expense } from "../../lib/schemas";
import { ExpenseRow, rowClass } from "./expense-row";

export function Bin() {
  const bin = useApi(z.array(expense), ["/api/bin"]).data;
  const [asking, setAsking] = useState(false);
  const empty = useSend();
  const restore = useSend("expense");
  if (!bin) return null;
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
