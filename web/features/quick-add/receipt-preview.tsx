import { useId, useRef } from "react";

export function ReceiptPreview({ image }: { image: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  return (
    <>
      <button type="button" aria-label="Enlarge receipt" onClick={() => dialog.current?.showModal()} className="press size-11 shrink-0 rounded-token focus-visible:outline-2 focus-visible:outline-accent">
        <img src={image} alt="Receipt" className="size-full rounded-token object-cover" />
      </button>
      <dialog ref={dialog} aria-labelledby={title} onClick={(e) => { if (e.target === e.currentTarget) dialog.current?.close(); }} onKeyDown={(e) => e.stopPropagation()} className="fixed inset-0 m-auto max-h-[90dvh] w-[min(56rem,94vw)] overflow-auto rounded-card bg-surface p-4 text-ink shadow-lift backdrop:bg-bg/80">
        <div className="sticky top-0 flex items-center justify-between gap-4 bg-surface pb-3">
          <h2 id={title} className="text-[17px] font-semibold">Receipt</h2>
          <button type="button" autoFocus onClick={() => dialog.current?.close()} className="press min-h-11 rounded-chip bg-surface2 px-4 font-medium">Close receipt</button>
        </div>
        <img src={image} alt="Full receipt" className="h-auto w-full" />
      </dialog>
    </>
  );
}
