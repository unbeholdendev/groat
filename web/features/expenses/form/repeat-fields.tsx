import { Field, Input, Select } from "../../../components/form";
import type { ExpenseFormApi } from "../schema";

export function RepeatFields({ form, stops }: { form: ExpenseFormApi; stops: boolean }) {
  const { register, watch, formState: { errors } } = form;
  const period = watch("period");
  return (
    <div className="mt-6 flex flex-wrap items-end gap-2">
      <Field label="Repeat">
        <Select {...register("period")}>
          <option value="">{stops ? "Stop repeating" : "Doesn’t repeat"}</option>
          {["day", "week", "month", "year"].map((u) => (
            <option key={u} value={u}>
              Every {u}
            </option>
          ))}
        </Select>
      </Field>
      {period && (
        <>
          <Field label="Interval" error={errors.every?.message} className="w-20">
            <Input type="number" min="1" {...register("every")} />
          </Field>
          <Field label="Ends" error={errors.endDate?.message}>
            <Input type="date" {...register("endDate")} />
          </Field>
          <label className="flex h-10 items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-accent" {...register("needsConfirmation")} />
            Confirm each
          </label>
          <p className="w-full text-xs text-ink3">Interval 2 means every second {period}. With Confirm each, every one waits as pending until you confirm it.</p>
        </>
      )}
    </div>
  );
}
