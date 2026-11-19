import { type FormEvent, useEffect, useState } from "react";
import type { Unit } from "../../../shared/amount";
import { useSend } from "../../lib/api";
import type { Draft } from "../../lib/schemas";
import type { Asking } from "./use-ask";
import type { Drafting } from "./use-drafting";
import type { Entry, Mode } from "./use-entry";

export function useSubmit({
  entry,
  mode,
  unit,
  ai,
  drafting: { form, drafting },
  asking,
  clear,
  onForm,
  onChat,
}: {
  entry: Entry;
  mode: Mode;
  unit: Unit;
  ai: boolean;
  drafting: Drafting;
  asking: Asking;
  clear: () => void;
  onForm: () => void;
  onChat: (id: number) => void;
}) {
  const adding = useSend("transaction", clear);
  const [misread, setMisread] = useState<Draft>();
  const save = form.handleSubmit((v) =>
    adding.mutate([
      "POST",
      "/api/transactions",
      { ...v, attachmentId: drafting.data && "attachmentId" in drafting.data ? drafting.data.attachmentId : undefined },
    ]),
  );
  useEffect(() => {
    if (!adding.isPaused) return;
    clear();
    adding.reset();
  }, [adding.isPaused]);

  function ask(question = entry.question, expense?: Draft) {
    if (!question) return;
    const sent = entry.text;
    clear();
    setMisread(expense);
    asking.mutate(question, {
      onSuccess: (c) => mode === "chat" && onChat(c.id),
      onError: () => entry.setText((t) => t || sent),
    });
  }

  function add() {
    const text = entry.text.trim();
    if (!text) return;
    const { p, currency, date, category } = entry;
    if (ai && !p.amount) {
      const expense = entry.seed();
      return drafting.mutate(text, { onSuccess: (d) => "question" in d && ask(text, expense) });
    }
    if (!p.amount) return onForm();
    adding.mutate([
      "POST",
      "/api/transactions",
      { note: p.note, amount: p.amount, currency, unit: p.unit ?? unit, date, categoryId: category?.id, tags: p.tags },
    ]);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (mode === "chat" || mode === "asking") return ask();
    if (mode === "reviewing") return drafting.isSuccess && save();
    add();
  }

  return { adding, save, submit, misread };
}
