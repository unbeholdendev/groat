import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutationState } from "@tanstack/react-query";
import type { Unit } from "../../../shared/amount";
import { useSession } from "../../lib/api";
import { Icon, paths } from "../../components/icon";
import { useOnline } from "../../lib/online";
import type { Category, Draft, Settings, Suggestion } from "../../lib/schemas";
import { AnswerCard } from "./answer-card";
import { Chips } from "./chips";
import { FloatingAdd } from "./floating-add";
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
import { type Mode, modeOf, useEntry } from "./use-entry";
import { useReceipt } from "./use-receipt";
import { useReveal } from "./use-reveal";
import { useSlash } from "./use-slash";
import { useSubmit } from "./use-submit";

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
  const [focused, setFocused] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const inChat = settings.ai && props.chat !== undefined;
  const entry = useEntry(settings, categories, unit, inChat);
  const { text, p } = entry;
  const toForm = () => props.onForm(entry.seed());
  const drafts = useDrafting(unit, toForm);
  const { form, drafting, image, captureError, setCaptureError, unreview, photo, reviewing } = drafts;
  const mode = modeOf(entry, inChat, reviewing);
  const asking = useAsk(props.chat);
  const answering = !asking.isIdle && !inChat;
  const online = useOnline();
  const admin = useSession()?.user?.role === "admin";
  function clear() {
    entry.reset();
    unreview();
    props.onGuided();
  }
  const { adding, save, submit } = useSubmit({
    entry,
    mode,
    unit,
    ai: settings.ai,
    drafting: drafts,
    asking,
    clear,
    onForm: toForm,
    onChat: props.onChat,
  });
  const queued = useMutationState({ filters: { predicate: (m) => m.state.isPaused } }).length;
  const receipt = useReceipt(categories, unit, adding.mutate);
  const stack = useReveal(!!inline && reviewing, drafting.isSuccess);
  useShared((file) => (online ? photo(file) : setCaptureError(new Error("Photos need a connection"))));
  useEffect(() => {
    if (props.guide) input.current?.focus();
  }, [props.guide, target]);
  useSlash(input);

  function fill(s: Suggestion) {
    entry.setText(entry.line(s));
    input.current?.focus();
  }
  function close() {
    asking.reset();
    input.current?.focus();
  }
  const error = adding.error ?? (inChat ? asking.error : null) ?? captureError;
  const blank = !text.trim() && (mode === "idle" || mode === "typing");

  const content = (
    <div className={inline ? "relative z-10 isolate" : undefined}>
      <Incoming enabled={settings.vision && online && !inChat} onImage={photo} />
      {answering && <div className="fixed inset-0 -z-20 bg-bg/70" onClick={close} />}
      <form
        className={inline ? "flex flex-col" : undefined}
        aria-label="Quick add"
        onSubmit={submit}
        onKeyDown={(e) => {
          if (e.key !== "Escape") return;
          if (answering) close();
          else unreview();
        }}
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
          {answering && (
            <AnswerCard
              asking={asking}
              unit={unit}
              onClose={close}
              onForm={props.onForm}
              onChat={(id) => {
                clear();
                props.onChat(id);
              }}
            />
          )}
          {reviewing && !answering && (
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
          {!reviewing && !answering && entry.fills.length > 0 && (
            <PastEntries fills={entry.fills} unit={unit} onFill={fill} />
          )}
          {mode === "typing" && !answering && (
            <Chips
              categories={categories}
              category={entry.category}
              onCategory={entry.setCategoryId}
              date={entry.date}
              onDate={entry.setDate}
              currency={entry.currency}
              label={entry.currency === "BTC" ? (p.unit ?? unit) : entry.currency}
              recent={settings.recentCurrencies}
              onCurrency={(c) =>
                entry.setText(
                  p.currency ? p.parts.map(([w, k]) => (k === "currency" ? c : w)).join("") : `${text.trimEnd()} ${c}`,
                )
              }
            />
          )}
        </div>
        <div
          className={`flex ${inline ? "h-14" : "h-12"} items-center gap-2 rounded-field border pr-[3px] pl-3.5 transition-[background-color,border-color,box-shadow] duration-200 ${fieldTone(focused || !!text, inline)}`}
        >
          {inChat && (
            <span aria-hidden className="-mr-1 text-[17px] font-medium text-accent">
              ?
            </span>
          )}
          <LineInput
            ref={input}
            text={text}
            ask={entry.ask}
            inChat={inChat}
            parts={p.parts}
            ghost={entry.ghost}
            focused={focused}
            label={labelFor(mode, settings.ai)}
            placeholder={placeholderFor(mode, props.chat, inline)}
            onText={(t) => {
              entry.setText(t);
              adding.reset();
              setCaptureError(null);
              receipt.dismiss();
            }}
            onAccept={() => fill(entry.fills[0])}
            onFocus={setFocused}
          />
          {mode === "idle" && (
            <>
              <PhotoButton
                online={online}
                onPhoto={photo}
                off={settings.vision ? undefined : aiOff(settings, admin, "ai")}
                onOff={setCaptureError}
              />
              {!settings.voice && (
                <Mic onAudio={() => {}} onError={setCaptureError} off={aiOff(settings, admin, "voice")} />
              )}
              {settings.voice && online && (
                <Mic
                  onAudio={(audio) => {
                    setCaptureError(null);
                    drafting.mutate({ audio });
                  }}
                  onError={setCaptureError}
                />
              )}
            </>
          )}
          {blank ? (
            <button
              type="button"
              aria-label="Full form"
              title="Full form"
              onMouseDown={(e) => e.preventDefault()}
              onClick={toForm}
              className={`press hit grid shrink-0 place-items-center rounded-chip ${inline ? "size-9 bg-accent text-on-accent" : "size-11 text-ink2"}`}
            >
              <Icon d={inline ? paths.plus : paths.expand} className={inline ? "size-4" : "size-5"} />
            </button>
          ) : (
            <SubmitButton
              name={submitName(entry.ask, !!p.amount || settings.ai)}
              label={inline}
              dim={!text.trim() && !inChat}
              disabled={adding.isPending || asking.isPending || drafting.isPending || (entry.ask && !entry.question)}
            />
          )}
        </div>
        <span role="status" className="sr-only">
          {receipt.text}
        </span>
        {(focused || text || error || queued > 0 || receipt.shown || props.guide) && !answering && (
          <Hint
            settings={settings}
            unit={unit}
            text={text}
            ask={entry.ask}
            p={p}
            error={error}
            receipt={receipt}
            queued={queued}
            guide={props.guide}
            onUndo={receipt.undo}
            onForm={toForm}
          />
        )}
      </form>
      {inline && <FloatingAdd input={input} />}
    </div>
  );
  return target ? createPortal(content, target) : content;
}

function fieldTone(active: boolean, inline?: boolean) {
  if (active) return "border-accent bg-surface shadow-bar-active";
  return inline ? "border-accent/50 bg-surface shadow-panel" : "border-transparent bg-surface2";
}

function labelFor(mode: Mode, ai: boolean) {
  if (mode === "chat") return "Ask about your spending";
  return ai ? "Add an expense, or start with ? to ask" : "Add an expense";
}

function placeholderFor(mode: Mode, chat?: number, inline?: boolean) {
  if (mode === "chat") return chat ? "Reply" : "Ask about your spending";
  return inline ? "Add an expense" : "ramen 24.50";
}

function submitName(ask: boolean, adds: boolean) {
  if (ask) return "Ask";
  return adds ? "Add" : "Full form";
}
