import { useEffect, useId, useRef } from "react";
import { useBlocker } from "@tanstack/react-router";

export function DiscardDialog({ dirty, onDiscard }: { dirty: boolean; onDiscard: () => void }) {
  const blocker = useBlocker({ shouldBlockFn: () => dirty, enableBeforeUnload: dirty, withResolver: true });
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  useEffect(() => {
    if (blocker.status === "blocked") dialog.current?.showModal();
    else dialog.current?.close();
  }, [blocker.status]);

  return (
    <dialog
      ref={dialog}
      aria-labelledby={title}
      onCancel={(e) => {
        e.preventDefault();
        blocker.reset?.();
      }}
      className="fixed inset-0 m-auto w-[min(26rem,92vw)] rounded-card bg-surface p-5 text-ink shadow-lift backdrop:bg-bg/80"
    >
      <h2 id={title} className="text-[17px] font-semibold">
        Discard expense changes?
      </h2>
      <p className="mt-2 text-sm text-ink2">Your changes have not been saved.</p>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          autoFocus
          onClick={() => blocker.reset?.()}
          className="press min-h-11 rounded-chip bg-surface2 px-4 font-medium"
        >
          Keep editing
        </button>
        <button
          type="button"
          onClick={() => {
            onDiscard();
            blocker.proceed?.();
          }}
          className="press min-h-11 rounded-chip bg-accent px-4 font-medium text-on-accent"
        >
          Discard changes
        </button>
      </div>
    </dialog>
  );
}
