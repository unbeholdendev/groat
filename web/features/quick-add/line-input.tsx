import { type RefObject, useEffect, useRef } from "react";
import type { Part } from "../../../shared/parse";
import { Tokens } from "./tokens";

export function LineInput(props: {
  ref: RefObject<HTMLInputElement | null>;
  text: string;
  ask: boolean;
  inChat: boolean;
  parts: Part[];
  ghost: string;
  focused: boolean;
  label: string;
  placeholder: string;
  onText: (text: string) => void;
  onAccept: () => void;
  onFocus: (focused: boolean) => void;
}) {
  const { text, ask, inChat } = props;
  const mirror = useRef<HTMLDivElement>(null);
  const sync = () =>
    requestAnimationFrame(() => mirror.current && (mirror.current.scrollLeft = props.ref.current?.scrollLeft ?? 0));
  useEffect(() => void sync(), [text]);
  return (
    <div className="relative h-10 min-w-0 flex-1 text-[17px] font-medium tracking-[-0.01em] [word-spacing:0.25em]">
      <div
        ref={mirror}
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden leading-10 whitespace-pre"
      >
        {ask ? (
          <>
            {!inChat && <span className="text-accent">?</span>}
            {inChat ? text : text.slice(1)}
          </>
        ) : (
          <>
            <Tokens parts={props.parts} />
            {props.focused && <span className="text-ink3">{props.ghost.trimEnd()}</span>}
          </>
        )}
      </div>
      <input
        ref={props.ref}
        aria-label={props.label}
        className="absolute inset-0 w-full bg-transparent leading-10 text-transparent caret-accent outline-none [word-spacing:inherit] focus-visible:outline-none placeholder:font-normal placeholder:text-ink3"
        placeholder={props.placeholder}
        aria-keyshortcuts="/"
        autoComplete="off"
        enterKeyHint={ask ? "send" : "done"}
        value={text}
        onChange={(e) => props.onText(e.target.value)}
        onKeyDown={(e) => {
          const end = e.currentTarget.selectionStart === text.length;
          if (props.ghost && (e.key === "Tab" || (e.key === "ArrowRight" && end))) e.preventDefault(), props.onAccept();
        }}
        onSelect={sync}
        onScroll={sync}
        onFocus={() => props.onFocus(true)}
        onBlur={() => props.onFocus(false)}
      />
    </div>
  );
}
