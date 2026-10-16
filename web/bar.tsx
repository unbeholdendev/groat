import { type FormEvent, Fragment, useEffect, useRef, useState } from "react";
import { useMutation, useMutationState } from "@tanstack/react-query";
import { formatAmount, parseAmount, type Unit } from "../shared/amount";
import { confident, parse, type Part } from "../shared/parse";
import { type Category, chat as chatSchema, type Draft, draft as draftSchema, draftIn, expense, request, send, type Settings, type Suggestion, suggestion, unsent, useApi, useSend } from "./api";
import { z } from "zod";
import { CategoryOptions, Tile } from "./category";
import { dayLabel, today } from "./dates";
import { money } from "./period";
import { Incoming, useShared } from "./incoming";
import { shrink } from "./photo";
import { type Fields, fields, payload, Review } from "./review";
import { Mic, recording, useOnline } from "./mic";
import { Chevron, Icon } from "./ui";

const pill = "glass relative inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-chip px-3 text-[13px] font-medium text-ink shadow-dock has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent";


const styles = {
  tag: "rounded-token bg-track text-ink2 shadow-[0_0_0_2px_var(--track)]",
  amount: "rounded-token bg-accent-soft text-accent shadow-[0_0_0_2px_var(--accent-soft)]",
  currency: "text-accent",
  "": "",
};

export function Bar(props: {
  settings: Settings;
  unit: Unit;
  categories: Category[];
  guide: boolean;
  onGuided: () => void;
  chat?: number;
  onForm: (d: Draft) => void;
  onChat: (id: number) => void;
}) {
  const { settings, unit, categories } = props;
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [date, setDate] = useState(today);
  const mirror = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const inChat = settings.ai && props.chat !== undefined;
  const ask = inChat || (settings.ai && text.startsWith("?"));
  const question = text.replace(/^\?/, "").trim();
  const p = parse(ask ? "" : text, settings.currencies);
  const guesses =
    useApi(z.array(suggestion), ["/api/notes?prefix=", encodeURIComponent(p.note)], { enabled: p.note.length > 1 }).data ?? [];
  const guess = guesses[0];
  const line = (s: Suggestion) =>
    s.currency === "BTC"
      ? `${s.note} ${s.amount} sats `
      : `${s.note} ${formatAmount(s.amount, s.currency)}${s.currency === settings.lastCurrency ? "" : ` ${s.currency.toLowerCase()}`} `;
  const fills = p.note.length > 1 && !p.amount && !p.currency && !p.tags.length ? guesses.slice(0, 3) : [];
  const ghost = fills[0] && line(fills[0]).toLowerCase().startsWith(text.toLowerCase()) ? line(fills[0]).slice(text.length) : "";
  const fill = (s: Suggestion) => (setText(line(s)), sync(), input.current?.focus());
  const category = categories.find((c) => c.id === (categoryId ?? (p.note.length > 1 ? guess?.categoryId : undefined)));
  const currency = p.currency ?? (p.note.length > 1 ? guess?.currency : undefined) ?? settings.lastCurrency;
  const [review, setReview] = useState<Fields | null>(null);
  const [captureError, setCaptureError] = useState<Error | null>(null);
  const [image, setImage] = useState<string>();
  const picker = useRef<HTMLInputElement>(null);
  const online = useOnline();
  const drafting = useMutation({
    mutationFn: async (input: string | { audio: Blob } | { photo: Blob }) => {
      if (typeof input === "string") return draftSchema.parse(await send("POST", "/api/drafts", { text: input }));
      if ("audio" in input) return draftSchema.parse(await send("POST", "/api/voice", recording(input.audio)));
      const body = new FormData();
      body.set("image", await shrink(input.photo), "receipt.jpg");
      return draftSchema.parse(await send("POST", "/api/drafts/photo", body));
    },
    networkMode: "always",
    onSuccess: (d) => setReview(fields(d, unit)),
    onError: (e, input) => (typeof input === "string" ? props.onForm({ ...seed(), note: input }) : (setCaptureError(e), drop())),
  });
  const reviewing = drafting.isPending || !!review;
  const drop = () => (image && URL.revokeObjectURL(image), setImage(undefined));
  const unreview = () => (setReview(null), drafting.reset(), drop());
  const save = () => review && adding.mutate(["POST", "/api/expenses", { ...payload(review, unit), attachmentId: drafting.data?.attachmentId }]);
  const photo = (file: Blob) => (unreview(), setCaptureError(null), setImage(URL.createObjectURL(file)), drafting.mutate({ photo: file }));
  useShared((file) => (online ? photo(file) : setCaptureError(new Error("Photos need a connection"))));
  const clear = () => (setText(""), setCategoryId(null), setDate(today()), unreview(), props.onGuided());
  const adding = useSend(clear);
  const queued = useMutationState({ filters: { predicate: (m) => m.state.isPaused } }).length;
  const receipt = useMutationState({
    filters: {
      mutationKey: ["send"],
      predicate: ({ state }) => {
        if ((state.status !== "success" && !state.isPaused) || Date.now() - state.submittedAt > 5000) return false;
        const [method, path] = request.parse(state.variables);
        if (method === "POST") return path === "/api/expenses";
        return method === "DELETE" && /^\/api\/expenses\/\d+$/.test(path) && !state.isPaused;
      },
    },
    select: ({ mutationId, state }) => {
      const [method, , body] = request.parse(state.variables);
      const row = expense.safeParse(state.data).data ?? unsent(body, 0);
      return row && { id: mutationId, binned: method === "DELETE", row };
    },
  })
    .filter((r) => r !== undefined)
    .at(-1);
  const [dismissed, dismiss] = useState(0);
  const [hold, setHold] = useState(false);
  const shown = receipt && receipt.id > dismissed ? receipt : undefined;
  useEffect(() => {
    if (!shown || hold) return;
    const timer = setTimeout(() => dismiss(shown.id), 5000);
    return () => clearTimeout(timer);
  }, [shown?.id, hold]);
  const receiptCategory = shown && categories.find((c) => c.id === shown.row.categoryId);
  const receiptText =
    shown &&
    [
      `${shown.binned ? "Binned" : "Added"} ${shown.row.note}`.trim(),
      receiptCategory && `${receiptCategory.icon} ${receiptCategory.name}`,
      money(shown.row.amount, shown.row.currency, unit),
      !shown.row.id && "will sync",
    ]
      .filter(Boolean)
      .join(" · ");
  const undo = (r: NonNullable<typeof shown>) => (
    dismiss(r.id),
    adding.mutate(r.binned ? ["POST", `/api/bin/${r.row.id}/restore`] : ["DELETE", `/api/expenses/${r.row.id}?purge`])
  );
  useEffect(() => {
    if (adding.isPaused) (clear(), adding.reset());
  }, [adding.isPaused]);
  const asking = useMutation({
    mutationKey: ["ask", props.chat || null],
    mutationFn: async (message: string) => chatSchema.parse(await send("POST", props.chat ? `/api/chats/${props.chat}/messages` : "/api/chats", { message })),
  });
  useEffect(() => asking.reset(), [props.chat]);
  const card = !asking.isIdle && !inChat;
  useEffect(() => void (card && cardRef.current?.focus()), [card]);
  useEffect(() => void (props.guide && input.current?.focus()), [props.guide]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || !(t instanceof HTMLElement) || t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      e.preventDefault();
      input.current?.focus();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);
  const close = () => (asking.reset(), input.current?.focus());
  const error = adding.error ?? (inChat ? asking.error : null) ?? captureError;
  const chat = asking.data;
  const answer = chat?.messages?.findLast((m) => m.role === "assistant" && m.content)?.content;
  const drafts = (chat?.messages ?? [])
    .filter((m) => m.role === "tool" && m.content?.startsWith('{"draft"'))
    .flatMap((m) => draftIn(m.content) ?? []);
  const active = focused || !!text;
  const other = settings.currencies.find((c) => c !== "BTC" && c !== settings.lastCurrency);
  const examples = [other && `12 ${other.toLowerCase()}`, settings.currencies.includes("BTC") && "5000 sats", "#work"].filter((e) => typeof e === "string");
  const sync = () => requestAnimationFrame(() => mirror.current && (mirror.current.scrollLeft = (mirror.current.nextElementSibling?.scrollLeft ?? 0)));

  const seed = (): Draft => ({
    note: p.note,
    amount: (p.amount && parseAmount(p.amount, currency, p.unit ?? unit)) || 0,
    currency,
    date,
    categoryId: category?.id ?? 0,
    tags: p.tags,
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (ask) return question && asking.mutate(question, { onSuccess: (c) => inChat && (clear(), props.onChat(c.id)) });
    if (reviewing) return save();
    if (settings.ai && !confident(p, category?.id)) return drafting.mutate(text.trim());
    if (!p.amount) return props.onForm(seed());
    adding.mutate([
      "POST",
      "/api/expenses",
      { note: p.note, amount: p.amount, currency, unit: p.unit ?? unit, date, categoryId: category?.id, tags: p.tags },
    ]);
  }

  const key = ask ? "Ask" : text.trim() && (p.amount || settings.ai) ? "Add" : "Full form";
  const glyph = key === "Ask" ? "M12 19V5M6 11l6-6 6 6" : key === "Add" ? "M20 5v7a3 3 0 0 1-3 3H5M9 11l-4 4 4 4" : "M12 5v14M5 12h14";
  const tag = (w: string, kind: Part[1], i: number) => (
    <span key={i} className={styles[kind]}>
      {w}
    </span>
  );

  return (
    <>
      <Incoming enabled={settings.vision && online && !inChat} onImage={photo} />
      {card && <div className="fixed inset-0 -z-20 bg-bg/70" onClick={close} />}
      <form onSubmit={submit} onKeyDown={(e) => e.key === "Escape" && (card ? close() : unreview())}>
        <div className="absolute inset-x-0 bottom-full grid gap-2 pb-2">
          {card && (
            <section
              ref={cardRef}
              tabIndex={-1}
              aria-live="polite"
              className="rise max-h-[55dvh] overflow-y-auto rounded-card bg-surface px-5 pt-[18px] pb-2.5 shadow-lift outline-none"
            >
              <p className={`text-[17px] leading-snug font-medium whitespace-pre-wrap ${asking.isPending ? "text-ink3" : ""}`}>
                {(asking.error && "Couldn’t reach the AI service. Check its settings on the server, then try again.") ?? answer ?? (asking.isPending ? "Looking at your expenses…" : "No answer came back.")}
              </p>
              {drafts.map((d, i) => (
                <button
                  type="button"
                  key={i}
                  onClick={() => (props.onForm(d), asking.reset())}
                  className="press mt-3 flex w-full justify-between gap-3 rounded-field bg-surface2 px-3.5 py-2.5 text-left"
                >
                  <span>
                    Review draft: <b className="font-medium">{d.note}</b>, {dayLabel(d.date)}
                  </span>
                  <span className="num whitespace-nowrap">{money(d.amount, d.currency, unit)}</span>
                </button>
              ))}
              <div className="mt-3 flex justify-end gap-1 border-t border-line pt-1.5">
                <button type="button" onClick={close} className="press hit rounded-chip px-2.5 py-1.5 text-[13px] font-medium text-ink2">
                  Close
                </button>
                {asking.error && (
                  <button type="button" onClick={() => asking.variables && asking.mutate(asking.variables)} className="press hit rounded-chip px-2.5 py-1.5 text-[13px] font-medium text-accent">
                    Try again
                  </button>
                )}
                {chat && (
                  <button type="button" onClick={() => (clear(), props.onChat(chat.id))} className="press hit rounded-chip px-2.5 py-1.5 text-[13px] font-medium text-accent">
                    Continue in chat
                  </button>
                )}
              </div>
            </section>
          )}
          {reviewing && !card && (
            <Review
              value={review}
              onChange={setReview}
              categories={categories}
              currencies={settings.currencies}
              unit={unit}
              image={image}
              saving={adding.isPending}
              onSave={save}
              onDismiss={unreview}
            />
          )}
          {fills.length > 0 && !card && !reviewing && (
            <div className="rise flex gap-1.5" aria-label="Past entries">
              {fills.map((s) => (
                <button key={s.note} type="button" className={`${pill} press hit min-w-0 shrink`} onMouseDown={(e) => e.preventDefault()} onClick={() => fill(s)}>
                  <span className="truncate">{s.note}</span>
                  <span className="num text-ink3">{money(s.amount, s.currency, unit)}</span>
                </button>
              ))}
            </div>
          )}
          {text && !ask && !card && !reviewing && (
            <div className="rise flex gap-1.5">
              <label className={`${pill} press ${category ? "pl-1" : ""}`}>
                {category && <Tile category={category} small />}
                {category ? category.name : "Category"}
                <Chevron />
                <select
                  aria-label="Category"
                  className="absolute inset-x-0 -inset-y-1.5 opacity-0"
                  value={category?.id ?? ""}
                  onChange={(e) => setCategoryId(Number(e.target.value) || null)}
                >
                  <option value="">Category</option>
                  <CategoryOptions categories={categories} />
                </select>
              </label>
              <label className={`${pill} press`}>
                {dayLabel(date)}
                <Chevron />
                <input
                  aria-label="Date"
                  type="date"
                  className="absolute inset-x-0 -inset-y-1.5 opacity-0"
                  max={today()}
                  value={date}
                  onClick={(e) => e.currentTarget.showPicker?.()}
                  onChange={(e) => setDate(e.target.value || today())}
                />
              </label>
              <span className={`${pill} num text-ink2`}>{currency === "BTC" ? (p.unit ?? unit) : currency}</span>
            </div>
          )}
        </div>
        <div
          className={`flex h-12 items-center gap-2 rounded-field border pr-[3px] pl-3.5 transition-[background-color,border-color,box-shadow] duration-200 ${active ? "border-accent bg-surface shadow-bar-active" : "border-transparent bg-surface2"}`}
        >
          {inChat && <span aria-hidden className="-mr-1 text-[17px] font-medium text-accent">?</span>}
          <div className="relative h-10 min-w-0 flex-1 text-[17px] font-medium tracking-[-0.01em] [word-spacing:0.25em]">
            <div ref={mirror} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden leading-10 whitespace-pre">
              {ask ? (
                <>
                  {!inChat && <span className="text-accent">?</span>}
                  {inChat ? text : text.slice(1)}
                </>
              ) : (
                <>
                  {p.parts.map(([w, kind], i) => tag(w, kind, i))}
                  {focused && <span className="text-ink3">{ghost.trimEnd()}</span>}
                </>
              )}
            </div>
            <input
              ref={input}
              aria-label={inChat ? "Ask about your spending" : settings.ai ? "Add an expense, or start with ? to ask" : "Add an expense"}
              className="absolute inset-0 w-full bg-transparent leading-10 text-transparent caret-accent outline-none [word-spacing:inherit] focus-visible:outline-none placeholder:font-normal placeholder:text-ink3"
              placeholder={inChat ? (props.chat ? "Reply" : "Ask about your spending") : "ramen 24.50"}
              autoComplete="off"
              enterKeyHint={ask ? "send" : "done"}
              value={text}
              onChange={(e) => (setText(e.target.value), adding.reset(), setCaptureError(null), shown && dismiss(shown.id), sync())}
              onKeyDown={(e) => {
                const end = e.currentTarget.selectionStart === text.length;
                if (ghost && (e.key === "Tab" || (e.key === "ArrowRight" && end))) (e.preventDefault(), fill(fills[0]));
              }}
              onSelect={sync}
              onScroll={sync}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
            />
          </div>
          {!focused && !text && !inChat && (
            <kbd aria-hidden className="hidden rounded-token border border-line2 px-1.5 text-[11px] font-medium text-ink3 pointer-fine:inline">
              /
            </kbd>
          )}
          {!text && !inChat && !reviewing && settings.vision && (
            <>
              <input
                ref={picker}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) photo(file);
                }}
              />
              <button
                type="button"
                aria-label="Add from a photo"
                title={online ? "Add from a photo" : "Photos need a connection"}
                disabled={!online}
                onClick={() => picker.current?.click()}
                className="press hit grid size-10 shrink-0 place-items-center rounded-chip text-ink2 disabled:opacity-50"
              >
                <Icon className="size-[18px] stroke-2">
                  <path d="M3 8.5h4l2-3h6l2 3h4V19H3z" />
                  <circle cx="12" cy="13" r="3.5" />
                </Icon>
              </button>
            </>
          )}
          {!text && !inChat && !reviewing && settings.voice && online ? (
            <Mic onAudio={(audio) => (setCaptureError(null), drafting.mutate({ audio }))} onError={setCaptureError} />
          ) : (
            <button
              aria-label={key}
              disabled={adding.isPending || asking.isPending || drafting.isPending || (inChat && !question)}
              className={`press hit grid size-10 shrink-0 place-items-center rounded-chip transition-[scale,background-color,color] duration-200 disabled:opacity-50 ${!text.trim() && !inChat ? "text-ink3" : key === "Full form" ? "bg-accent-soft text-accent" : "bg-accent text-on-accent"}`}
            >
              <Icon key={glyph} className="size-[18px] stroke-2 transition-[scale,opacity] duration-300 ease-out starting:scale-50 starting:opacity-0">
                <path d={glyph} />
              </Icon>
            </button>
          )}
        </div>
        <span role="status" className="sr-only">
          {receiptText}
        </span>
        {(active || error || queued > 0 || shown || props.guide) && !card && (
          <p
            onMouseEnter={() => setHold(true)}
            onMouseLeave={() => setHold(false)}
            onFocus={() => setHold(true)}
            onBlur={() => setHold(false)}
            className="flex min-h-7 items-center justify-between gap-3 px-1.5 pt-1.5 text-xs text-ink3"
          >
            {error ? (
              <span className="text-up">{error.message}</span>
            ) : ask ? (
              <span>Answers come from your own data. Expenses are only added once you review them.</span>
            ) : text && settings.ai && !confident(p, category?.id) ? (
              <span>Press Enter and AI reads it for you to check.</span>
            ) : text && !p.amount ? (
              <span>Add an amount, like 24.50, or press Enter for the full form.</span>
            ) : text ? (
              <span className="flex min-w-0 gap-1 text-ink2">
                <span className="truncate">{p.note || "No note"}</span>·<span className="num shrink-0 text-ink">{money(seed().amount, currency, p.unit ?? unit)}</span>
                {p.tags.length > 0 && <span className="truncate">· {p.tags.map((t) => `#${t}`).join(" ")}</span>}
                {category && !categoryId && <span className="shrink-0 text-ink3">· category guessed</span>}
              </span>
            ) : shown ? (
              <span key={shown.id} className="rise flex min-w-0 items-center gap-2 text-ink2">
                <Tile category={receiptCategory} small />
                <span className="truncate">{`${shown.binned ? "Binned" : "Added"} ${shown.row.note}`.trim()}</span>·
                <span className="num shrink-0 text-ink">{money(shown.row.amount, shown.row.currency, unit)}</span>
                {!shown.row.id && <span className="shrink-0 text-ink3">· will sync</span>}
              </span>
            ) : queued > 0 ? (
              <span>Offline. Saved here, will sync.</span>
            ) : props.guide ? (
              <span className="text-ink2">Start with the last thing you paid for</span>
            ) : (
              <span className="min-w-0 [word-spacing:0.15em]">
                Try{" "}
                {examples.map((e, i) => (
                  <Fragment key={e}>
                    {i > 0 && " · "}
                    {parse(e, settings.currencies).parts.map(([w, kind], j) => tag(w, kind, j))}
                  </Fragment>
                ))}
                {settings.ai && (
                  <>
                    {" · "}
                    <span className="whitespace-nowrap">
                      Start with <kbd className="rounded-token border border-line2 bg-surface px-1 text-[11px] font-medium text-ink2">?</kbd> to ask
                    </span>
                  </>
                )}
              </span>
            )}
            {shown && !ask && !text ? (
              shown.row.id > 0 && (
                <button type="button" onClick={() => undo(shown)} className="press hit shrink-0 font-medium text-accent">
                  Undo
                </button>
              )
            ) : !ask && (!text || p.amount) && (
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => props.onForm(seed())} className="press hit shrink-0 font-medium text-ink2">
                Full form
              </button>
            )}
          </p>
        )}
      </form>
    </>
  );
}
