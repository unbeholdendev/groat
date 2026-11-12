import { type FormEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutationState } from "@tanstack/react-query";
import { parseAmount, type Unit } from "../../../shared/amount";
import { parse } from "../../../shared/parse";
import { useSend, useSession } from "../../lib/api";
import { Icon, paths } from "../../components/icon";
import { today } from "../../lib/dates";
import { useOnline } from "../../lib/online";
import type { Category, Draft, Settings, Suggestion } from "../../lib/schemas";
import { AnswerCard } from "./answer-card";
import { Chips } from "./chips";
import { aiOff, Hint } from "./hint";
import { Incoming, useShared } from "./incoming";
import { LineInput } from "./line-input";
import { Mic } from "./mic";
import { PastEntries } from "./past-entries";
import { PhotoButton } from "./photo-button";
import { Review } from "./review";
import { SubmitButton } from "./submit-button";
import { useAsk } from "./use-ask";
import { useDrafting } from "./use-drafting";
import { useReceipt } from "./use-receipt";
import { useSlash } from "./use-slash";
import { useSuggestions } from "./use-suggestions";

export function Bar(props: {
  inline?: boolean;
  target?: HTMLElement | null;
  settings: Settings;
  unit: Unit;
  categories: Category[];
  guide: boolean;
  onGuided: () => void;
  chat?: number;
  onForm: (d: Draft) => void;
  onChat: (id: number) => void;
}) {
  const { settings, unit, categories, inline, target } = props;
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [date, setDate] = useState(today);
  const input = useRef<HTMLInputElement>(null);
  const inChat = settings.ai && props.chat !== undefined;
  const ask = inChat || (settings.ai && text.startsWith("?"));
  const question = text.replace(/^\?/, "").trim();
  const p = parse(ask ? "" : text, settings.recentCurrencies);
  const { guess, fills, ghost, line } = useSuggestions(p, text, settings.lastCurrency);
  const fill = (s: Suggestion) => (setText(line(s)), input.current?.focus());
  const category = categories.find((c) => c.id === (categoryId ?? guess?.categoryId));
  const currency = p.currency ?? guess?.currency ?? settings.lastCurrency;
  const online = useOnline();
  const admin = useSession()?.user?.role === "admin";
  const seed = (): Draft => ({
    note: p.note,
    amount: (p.amount && parseAmount(p.amount, currency, p.unit ?? unit)) || 0,
    currency,
    date,
    categoryId: category?.id ?? 0,
    tags: p.tags,
  });
  const { form, drafting, image, captureError, setCaptureError, unreview, photo, reviewing } = useDrafting(unit, () =>
    props.onForm(seed()),
  );
  useShared((file) => (online ? photo(file) : setCaptureError(new Error("Photos need a connection"))));
  const clear = () => (setText(""), setCategoryId(null), setDate(today()), unreview(), props.onGuided());
  const adding = useSend("transaction", clear);
  const save = form.handleSubmit((v) =>
    adding.mutate(["POST", "/api/transactions", { ...v, attachmentId: drafting.data?.attachmentId }]),
  );
  const queued = useMutationState({ filters: { predicate: (m) => m.state.isPaused } }).length;
  const receipt = useReceipt(categories, unit, adding.mutate);
  useEffect(() => {
    if (adding.isPaused) clear(), adding.reset();
  }, [adding.isPaused]);
  const asking = useAsk(props.chat);
  const card = !asking.isIdle && !inChat;
  useEffect(() => void (props.guide && input.current?.focus()), [props.guide, target]);
  useSlash(input);
  const close = () => (asking.reset(), input.current?.focus());
  const error = adding.error ?? (inChat ? asking.error : null) ?? captureError;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (ask) {
      if (!question) return;
      const sent = text;
      clear();
      return asking.mutate(question, {
        onSuccess: (c) => inChat && props.onChat(c.id),
        onError: () => setText((t) => t || sent),
      });
    }
    if (reviewing) return drafting.isSuccess && save();
    if (!text.trim()) return;
    if (settings.ai && !p.amount) return drafting.mutate(text.trim());
    if (!p.amount) return props.onForm(seed());
    adding.mutate([
      "POST",
      "/api/transactions",
      { note: p.note, amount: p.amount, currency, unit: p.unit ?? unit, date, categoryId: category?.id, tags: p.tags },
    ]);
  }

  const key = ask ? "Ask" : p.amount || settings.ai ? "Add" : "Full form";
  const empty = !text.trim() && !inChat && !reviewing;

  const stack = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (inline && reviewing) stack.current?.scrollIntoView({ block: "nearest" });
  }, [inline, reviewing, drafting.isSuccess]);

  const [away, setAway] = useState(false);
  useEffect(() => {
    if (!inline) return;
    const observer = new IntersectionObserver(([entry]) => setAway(!entry.isIntersecting), {
      root: input.current!.closest("main"),
    });
    observer.observe(input.current!);
    return () => observer.disconnect();
  }, [inline, target]);

  const content = (
    <div className={inline ? "relative z-10 isolate" : undefined}>
      <Incoming enabled={settings.vision && online && !inChat} onImage={photo} />
      {card && <div className="fixed inset-0 -z-20 bg-bg/70" onClick={close} />}
      <form
        className={inline ? "flex flex-col" : undefined}
        aria-label="Quick add"
        onSubmit={submit}
        onKeyDown={(e) => e.key === "Escape" && (card ? close() : unreview())}
      >
        <div
          ref={stack}
          data-stack
          className={
            inline
              ? "order-2 grid grid-cols-1 gap-2 pt-2 empty:hidden"
              : "absolute inset-x-0 bottom-full grid grid-cols-1 gap-2 pb-2"
          }
        >
          {card && (
            <AnswerCard
              asking={asking}
              unit={unit}
              onClose={close}
              onForm={props.onForm}
              onChat={(id) => (clear(), props.onChat(id))}
            />
          )}
          {reviewing && !card && (
            <Review
              form={form}
              ready={drafting.isSuccess}
              categories={categories}
              recent={settings.recentCurrencies}
              unit={unit}
              image={image}
              saving={adding.isPending}
              onSave={save}
              onDismiss={unreview}
            />
          )}
          {fills.length > 0 && !card && !reviewing && <PastEntries fills={fills} unit={unit} onFill={fill} />}
          {text && !ask && !card && !reviewing && (
            <Chips
              categories={categories}
              category={category}
              onCategory={setCategoryId}
              date={date}
              onDate={setDate}
              currency={currency}
              label={currency === "BTC" ? (p.unit ?? unit) : currency}
              recent={settings.recentCurrencies}
              onCurrency={(c) =>
                setText(
                  p.currency ? p.parts.map(([w, k]) => (k === "currency" ? c : w)).join("") : `${text.trimEnd()} ${c}`,
                )
              }
            />
          )}
        </div>
        <div
          className={`flex ${inline ? "h-14" : "h-12"} items-center gap-2 rounded-field border pr-[3px] pl-3.5 transition-[background-color,border-color,box-shadow] duration-200 ${focused || text ? "border-accent bg-surface shadow-bar-active" : inline ? "border-accent/50 bg-surface shadow-panel" : "border-transparent bg-surface2"}`}
        >
          {inChat && (
            <span aria-hidden className="-mr-1 text-[17px] font-medium text-accent">
              ?
            </span>
          )}
          <LineInput
            ref={input}
            text={text}
            ask={ask}
            inChat={inChat}
            parts={p.parts}
            ghost={ghost}
            focused={focused}
            label={
              inChat
                ? "Ask about your spending"
                : settings.ai
                  ? "Add an expense, or start with ? to ask"
                  : "Add an expense"
            }
            placeholder={
              inChat ? (props.chat ? "Reply" : "Ask about your spending") : inline ? "Add an expense" : "ramen 24.50"
            }
            onText={(t) => (setText(t), adding.reset(), setCaptureError(null), receipt.dismiss())}
            onAccept={() => fill(fills[0])}
            onFocus={setFocused}
          />
          {!text && !inChat && !reviewing && (
            <PhotoButton
              online={online}
              onPhoto={photo}
              off={settings.vision ? undefined : aiOff(settings, admin, "ai")}
              onOff={setCaptureError}
            />
          )}
          {!text && !inChat && !reviewing && !settings.voice && (
            <Mic onAudio={() => {}} onError={setCaptureError} off={aiOff(settings, admin, "voice")} />
          )}
          {!text && !inChat && !reviewing && settings.voice && online && (
            <Mic onAudio={(audio) => (setCaptureError(null), drafting.mutate({ audio }))} onError={setCaptureError} />
          )}
          {empty ? (
            <button
              type="button"
              aria-label="Full form"
              title="Full form"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => props.onForm(seed())}
              className={`press hit grid shrink-0 place-items-center rounded-chip ${inline ? "size-9 bg-accent text-on-accent" : "size-11 text-ink2"}`}
            >
              <Icon d={inline ? paths.plus : paths.expand} className={inline ? "size-4" : "size-5"} />
            </button>
          ) : (
            <SubmitButton
              name={key}
              label={inline}
              dim={!text.trim() && !inChat}
              disabled={adding.isPending || asking.isPending || drafting.isPending || (ask && !question)}
            />
          )}
        </div>
        <span role="status" className="sr-only">
          {receipt.text}
        </span>
        {(focused || text || error || queued > 0 || receipt.shown || props.guide) && !card && (
          <Hint
            settings={settings}
            unit={unit}
            text={text}
            ask={ask}
            p={p}
            error={error}
            receipt={receipt}
            queued={queued}
            guide={props.guide}
            onUndo={receipt.undo}
            onForm={() => props.onForm(seed())}
          />
        )}
      </form>
      {inline && away && (
        <button
          type="button"
          onClick={() => {
            input.current?.focus({ preventScroll: true });
            input.current?.scrollIntoView({ block: "center" });
          }}
          className="press fixed right-5 bottom-[calc(env(safe-area-inset-bottom)+5rem)] z-20 flex min-h-11 items-center gap-2 rounded-chip bg-accent px-4 text-sm font-semibold text-on-accent lg:hidden"
        >
          <Icon d={paths.plus} className="size-4" />
          Add expense
        </button>
      )}
    </div>
  );
  return target ? createPortal(content, target) : content;
}
