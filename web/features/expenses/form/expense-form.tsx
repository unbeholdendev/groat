import { Button } from "../../../components/button";
import { useContext, useEffect, useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { Field, FormError, Input } from "../../../components/form";
import { useSend, useSettings } from "../../../lib/api";
import type { Draft } from "../../../lib/schemas";
import { UnitContext } from "../../../lib/unit";
import { useZodForm } from "../../../lib/use-zod-form";
import { useExpenses, usePending } from "../queries";
import { blank, expenseForm, filled, fromTemplate } from "../schema";
import { route, useList } from "../use-month";
import { CategoryChips, DateChips } from "./chips";
import { FormHeader } from "./form-header";
import { RepeatFields } from "./repeat-fields";

export function ExpenseForm() {
  const settings = useSettings()!;
  const [unit] = useContext(UnitContext);
  const { draft, template } = useLocation().state;
  const editing = Number(route.useSearch().edit) || null;
  const list = useList();
  const navigate = route.useNavigate();
  const form = useZodForm(expenseForm(unit), template ? fromTemplate(template, unit) : blank(settings.lastCurrency));
  const { watch, setValue, handleSubmit } = form;
  const [categoryId, date] = watch(["categoryId", "date"]);
  const editRow = [...(useExpenses() ?? []), ...usePending()].find((e) => e.id === editing);
  const saving = useSend("expense", close);
  const repeating = useSend(undefined, close);
  const [recurring, setRecurring] = useState(template?.id);

  useEffect(() => {
    if (!draft) return;
    fill(draft);
    navigate({ search: (prev) => prev, state: {}, replace: true });
  }, [draft]);
  useEffect(() => {
    if (editRow) fill(editRow);
  }, [editing, !!editRow]);
  useEffect(() => {
    if (saving.isPaused || repeating.isPaused) close();
  }, [saving.isPaused || repeating.isPaused]);

  function close() {
    navigate({ search: list, replace: true });
  }

  function fill(e: Draft) {
    setRecurring(undefined);
    saving.reset();
    repeating.reset();
    form.reset(filled(e, unit));
    scrollTo(0, 0);
  }

  const save = handleSubmit(({ categoryId, period, every, endDate, needsConfirmation, ...v }) => {
    const body = { ...v, unit, categoryId: categoryId || undefined };
    if (period)
      repeating.mutate([recurring ? "PUT" : "POST", recurring ? `/api/recurring/${recurring}` : "/api/recurring", { ...body, period, every: Number(every), endDate: endDate || null, needsConfirmation, startDate: v.date }]);
    else if (recurring) repeating.mutate(["DELETE", `/api/recurring/${recurring}`]);
    else saving.mutate([editing ? "PUT" : "POST", editing ? `/api/expenses/${editing}` : "/api/expenses", body]);
  });

  return (
    <form noValidate onSubmit={save} className="flex flex-col">
      <FormHeader
        form={form}
        title={editing ? "Edit expense" : recurring ? "Edit recurring" : "New expense"}
        submit={editing || recurring ? "Save" : "Add"}
        pending={saving.isPending || repeating.isPending}
        editing={!!editing}
        row={editRow}
        onCancel={close}
      />
      <CategoryChips value={categoryId} onChange={(id) => setValue("categoryId", id)} />
      <DateChips value={date} onChange={(d) => setValue("date", d)} />
      <Field label="Tags" className="mt-6">
        <Input placeholder="work, trip" {...form.register("tags")} />
      </Field>
      {editRow?.attachmentId != null && (
        <a href={`/api/attachments/${editRow.attachmentId}`} target="_blank" rel="noreferrer" className="mt-6 self-start">
          <img src={`/api/attachments/${editRow.attachmentId}`} alt="Receipt" className="max-h-40 rounded-field border border-line object-contain" />
        </a>
      )}
      {!editing && <RepeatFields form={form} stops={!!recurring} />}
      <FormError error={saving.error ?? repeating.error} className="mt-4" />
      {editing && (
        <Button variant="link" tone="up" className="mt-6 self-start text-sm" onClick={() => saving.mutate(["DELETE", `/api/expenses/${editing}`])}>
          Move to bin
        </Button>
      )}
    </form>
  );
}
