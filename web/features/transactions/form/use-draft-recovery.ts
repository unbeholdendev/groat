import { useContext, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Unit } from "../../../../shared/amount";
import { useSession } from "../../../lib/api";
import { persistCache } from "../../../lib/persistence";
import { UnitContext } from "../../../lib/unit";
import { useZodForm } from "../../../lib/use-zod-form";
import { transactionForm, type TransactionValues } from "../schema";

type Stored = { values: TransactionValues; recurring?: number; unit: Unit };

export function useDraftRecovery({
  slot,
  fresh,
  defaults,
  recurring: initialRecurring,
}: {
  slot: string;
  fresh: boolean;
  defaults: () => TransactionValues;
  recurring?: number;
}) {
  const [unit, setUnit] = useContext(UnitContext);
  const cache = useQueryClient();
  const key = ["transaction-draft", useSession()?.user?.username, slot];
  const [recovered] = useState(() => (fresh ? undefined : cache.getQueryData<Stored>(key)));
  const form = useZodForm(transactionForm(unit), recovered?.values ?? defaults());
  const [recurring, setRecurring] = useState(recovered?.recurring ?? initialRecurring);
  const values = JSON.stringify(form.watch());
  const dirty = !!recovered || values !== JSON.stringify(form.formState.defaultValues);

  useEffect(() => {
    if (recovered) setUnit(recovered.unit);
  }, [recovered]);
  useEffect(() => {
    if (dirty) cache.setQueryData(key, { values: form.getValues(), recurring, unit });
    else cache.removeQueries({ queryKey: key, exact: true });
    persistCache(cache);
  }, [values, recurring, unit, dirty]);

  const forget = () => cache.removeQueries({ queryKey: key, exact: true });
  function discard() {
    forget();
    persistCache(cache);
  }
  return { form, recovered: !!recovered, recurring, setRecurring, dirty, forget, discard };
}
