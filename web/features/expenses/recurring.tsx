import { useContext, useState } from "react";
import { z } from "zod";
import { BackToSettings } from "../../components/back-link";
import { Button } from "../../components/button";
import { Tile } from "../../components/category";
import { Confirm } from "../../components/confirm";
import { FormError } from "../../components/form";
import { divide, panel } from "../../components/styles";
import { useApi, useCategories, useSend } from "../../lib/api";
import { money } from "../../lib/money";
import { template, type Template } from "../../lib/schemas";
import { UnitContext } from "../../lib/unit";
import { rowClass } from "./expense-row";

export function Recurring({ onEdit }: { onEdit: (t: Template) => void }) {
  const query = useApi(z.array(template), ["/api/recurring"], { throwOnError: false });
  const templates = query.data ?? [];
  const categories = useCategories();
  const [unit] = useContext(UnitContext);
  const [stopping, setStopping] = useState<number | null>(null);
  const mutation = useSend();
  const act = (t: Template, action: string) => {
    setStopping(null);
    mutation.mutate(action === "DELETE" ? ["DELETE", `/api/recurring/${t.id}`] : ["POST", `/api/recurring/${t.id}/${action}`]);
  };
  return (
    <>
      <BackToSettings />
      <h1 className="mt-4 text-display font-bold">Recurring</h1>
      {query.isPending && <p role="status">Loading recurring expenses…</p>}
      <FormError error={query.error} />
      {query.isError && <Button onClick={() => void query.refetch()}>Try again</Button>}
      <FormError error={mutation.error} className="mt-4" />
      {query.data && templates.length === 0 && <p className="mt-4 text-ink3">Nothing repeats yet. Open the full form and set Repeat to add one.</p>}
      {templates.length > 0 && (
        <ul className={`mt-4 ${panel}`}>
          {templates.map((t) => (
            <li key={t.id} className={`${rowClass} ${divide} ${t.paused ? "[&>.tile]:opacity-50" : ""}`}>
              <Tile category={categories.find((c) => c.id === t.categoryId)} />
              <button className="min-w-0 flex-1 text-left" onClick={() => onEdit(t)}>
                <span className="block truncate font-medium">{t.note}</span>
                <span className="mt-0.5 block truncate text-xs font-medium text-ink3">
                  <span className="num">{money(t.amount, t.currency, unit)}</span> every {t.every > 1 ? `${t.every} ${t.period}s` : t.period}
                  {t.paused && " · paused"}
                </span>
              </button>
              {stopping === t.id ? (
                <Confirm ask="Stop? Past expenses stay." yes="Stop" onYes={() => act(t, "DELETE")} onNo={() => setStopping(null)} />
              ) : (
                <span className="flex gap-1 text-[13px] font-medium">
                  <Button onClick={() => act(t, t.paused ? "resume" : "pause")}>{t.paused ? "Resume" : "Pause"}</Button>
                  <Button tone="up" onClick={() => setStopping(t.id)}>
                    Stop
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
