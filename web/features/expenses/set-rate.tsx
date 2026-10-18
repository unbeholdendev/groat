import { Button } from "../../components/button";
import { Field, Input } from "../../components/form";
import { useSend, useSettings } from "../../lib/api";
import type { Expense } from "../../lib/schemas";
import { useZodForm } from "../../lib/use-zod-form";
import { rates } from "./schema";

export function SetRate({ expense: e, onDone }: { expense: Expense; onDone: () => void }) {
  const currencies = [...new Set([e.currency, useSettings()!.baseCurrency])].filter((c) => c !== "USD");
  const mutation = useSend();
  const { register, handleSubmit, formState: { errors } } = useZodForm(rates, { rates: Object.fromEntries(currencies.map((c) => [c, ""])) });
  const save = handleSubmit(async (v) => {
    try {
      for (const [currency, rate] of Object.entries(v.rates)) if (rate) await mutation.mutateAsync(["PUT", "/api/rates", { date: e.date, currency, rate }]);
      onDone();
    } catch {}
  });
  return (
    <form onSubmit={save} className="rise flex flex-wrap items-end gap-2 px-4 pb-4">
      {currencies.map((c) => (
        <Field key={c} label={`1 USD in ${c}`} error={errors.rates?.[c]?.message} className="min-w-0 flex-1">
          <Input inputMode="decimal" autoFocus={c === e.currency} {...register(`rates.${c}`)} />
        </Field>
      ))}
      <span className="flex w-full items-center justify-between text-[13px] font-medium">
        <span role="alert" className="text-up">
          {errors.root?.message ?? mutation.error?.message}
        </span>
        <span>
          <button type="button" className="hit rounded-chip px-2.5 py-1.5 text-ink2" onClick={onDone}>
            Cancel
          </button>
          <Button variant="primary" type="submit" className="hit h-8 px-3 text-[13px]">
            Save
          </Button>
        </span>
      </span>
    </form>
  );
}
