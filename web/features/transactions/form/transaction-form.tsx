import { Button } from "../../../components/button";
import { useContext, useEffect } from "react";
import { useCanGoBack, useLocation, useRouter } from "@tanstack/react-router";
import { Field, FormError, Input } from "../../../components/form";
import { kinds } from "../../../../shared/schema";
import { Segmented } from "../../../components/segmented";
import { useCategories, useSend, useSettings } from "../../../lib/api";
import type { Draft } from "../../../lib/schemas";
import { UnitContext } from "../../../lib/unit";
import { useKindOf, useTransactions, usePending } from "../queries";
import { blank, filled, fromTemplate } from "../schema";
import { route, useList } from "../use-month";
import { CategoryChips, DateChips } from "./chips";
import { DiscardDialog } from "./discard-dialog";
import { FormHeader } from "./form-header";
import { RepeatFields } from "./repeat-fields";
import { useDraftRecovery } from "./use-draft-recovery";

export function TransactionForm() {
  const settings = useSettings()!;
  const [unit] = useContext(UnitContext);
  const { draft, template } = useLocation().state;
  const editing = Number(route.useSearch().edit) || null;
  const list = useList();
  const navigate = route.useNavigate();
  const { history } = useRouter();
  const back = useCanGoBack();
  const kindOf = useKindOf();
  const { form, recovered, recurring, setRecurring, dirty, forget, discard } = useDraftRecovery({
    slot: draftSlot(editing, template?.id),
    fresh: !!draft,
    defaults: () => (template ? fromTemplate(template, unit, kindOf(template)) : blank(settings.lastCurrency)),
    recurring: template?.id,
  });
  const { watch, setValue, handleSubmit } = form;
  const [categoryId, date, kind] = watch(["categoryId", "date", "kind"]);
  const categories = useCategories();
  const editRow = [...(useTransactions() ?? []), ...usePending()].find((e) => e.id === editing);
  const saving = useSend("transaction", () => close(true));
  const repeating = useSend("recurring", () => close(true));

  useEffect(() => {
    if (!draft) return;
    fill(draft);
    navigate({ search: (prev) => prev, state: {}, replace: true });
  }, [draft]);
  useEffect(() => {
    if (editRow && categories.length && !recovered) fill(editRow);
  }, [editing, !!editRow, !!categories.length]);
  useEffect(() => {
    if (saving.isPaused || repeating.isPaused) close(true);
  }, [saving.isPaused || repeating.isPaused]);

  function close(saved = false) {
    if (saved || !dirty) forget();
    if (back) history.back({ ignoreBlocker: saved });
    else navigate({ search: list, replace: true, ignoreBlocker: saved });
  }

  function fill(e: Draft) {
    setRecurring(undefined);
    saving.reset();
    repeating.reset();
    form.reset(filled(e, unit, kindOf(e)));
    document.querySelector("main")?.scrollTo(0, 0);
  }

  const save = handleSubmit(({ categoryId, period, every, endDate, needsConfirmation, kind, ...v }) => {
    const body = { ...v, unit, categoryId: categoryId || categories.find((c) => c.builtin && c.kind === kind)?.id };
    if (period)
      repeating.mutate([
        recurring ? "PUT" : "POST",
        recurring ? `/api/recurring/${recurring}` : "/api/recurring",
        { ...body, period, every: Number(every), endDate: endDate || null, needsConfirmation, startDate: v.date },
      ]);
    else if (recurring) repeating.mutate(["DELETE", `/api/recurring/${recurring}`]);
    else
      saving.mutate([editing ? "PUT" : "POST", editing ? `/api/transactions/${editing}` : "/api/transactions", body]);
  });

  return (
    <form noValidate onSubmit={save} className="flex flex-col">
      <FormHeader
        form={form}
        title={formTitle(kind, editing, recurring)}
        submit={editing || recurring ? "Save" : "Add"}
        pending={saving.isPending || repeating.isPending}
        editing={!!editing}
        row={editRow}
        onCancel={() => close()}
      />
      {editRow?.conversion && (
        <div className="mt-3 text-[13px] text-ink2">
          <p>Conversion for {editRow.conversion.date}</p>
          {[editRow.conversion.from, editRow.conversion.to].map((q, i) => (
            <p key={i}>
              {q
                ? "1 USD = " +
                  q.rate +
                  " " +
                  q.currency +
                  " · " +
                  q.source +
                  " · rate date " +
                  (q.rateDate ?? "unknown (cached history)")
                : "Missing rate."}
            </p>
          ))}
        </div>
      )}
      {recovered && (
        <p role="status" className="mt-3 text-sm text-ink2">
          Recovered unsaved expense.
        </p>
      )}
      <DiscardDialog dirty={dirty} onDiscard={discard} />
      <div className="mt-5">
        <Segmented
          label="Kind"
          options={kinds}
          names={{ expense: "Expense", income: "Income" }}
          value={kind}
          onChange={(k) => {
            setValue("kind", k);
            if (kindOf({ categoryId }) !== k) setValue("categoryId", null);
          }}
        />
      </div>
      <CategoryChips kind={kind} value={categoryId} onChange={(id) => setValue("categoryId", id)} />
      <DateChips value={date} onChange={(d) => setValue("date", d)} />
      <Field label="Tags" className="mt-6">
        <Input placeholder="work, trip" {...form.register("tags")} />
      </Field>
      {editRow?.attachmentId != null && (
        <a
          href={`/api/attachments/${editRow.attachmentId}`}
          target="_blank"
          rel="noreferrer"
          className="mt-6 self-start"
        >
          <img
            src={`/api/attachments/${editRow.attachmentId}`}
            alt="Receipt"
            className="max-h-40 rounded-field border border-line object-contain"
          />
        </a>
      )}
      {!editing && <RepeatFields form={form} stops={!!recurring} />}
      <FormError error={saving.error ?? repeating.error} className="mt-4" />
      {editing && (
        <Button
          variant="link"
          tone="up"
          className="mt-6 self-start text-sm"
          onClick={() => saving.mutate(["DELETE", `/api/transactions/${editing}`])}
        >
          Move to bin
        </Button>
      )}
    </form>
  );
}

function draftSlot(editing: number | null, template?: number) {
  if (editing) return `edit:${editing}`;
  return template ? `recurring:${template}` : "new";
}

function formTitle(kind: string, editing: number | null, recurring?: number) {
  if (editing) return `Edit ${kind}`;
  return recurring ? "Edit recurring" : `New ${kind}`;
}
