import { type FormEvent, useEffect } from "react";
import type { Unit } from "../../../shared/amount";
import { useSend } from "../../lib/api";
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
  const save = form.handleSubmit((v) =>
    adding.mutate(["POST", "/api/transactions", { ...v, attachmentId: drafting.data?.attachmentId }]),
  );
  useEffect(() => {
    if (!adding.isPaused) return;
    clear();
    adding.reset();
  }, [adding.isPaused]);

  function ask() {
    if (!entry.question) return;
    const sent = entry.text;
    clear();
    asking.mutate(entry.question, {
      onSuccess: (c) => mode === "chat" && onChat(c.id),
      onError: () => entry.setText((t) => t || sent),
    });
  }

  function add() {
    const text = entry.text.trim();
    if (!text) return;
    const { p, currency, date, category } = entry;
    if (ai && !p.amount) return drafting.mutate(text);
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

  return { adding, save, submit };
}
