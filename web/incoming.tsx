import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const image = (files: FileList | undefined) => [...(files ?? [])].find((f) => f.type.startsWith("image/"));
const editable = (t: EventTarget | null) => t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement;

export function useShared(onImage: (file: Blob) => void) {
  useEffect(() => {
    if (!("caches" in window)) return;
    caches.open("share").then(async (cache) => {
      const shared = await cache.match("/shared-image");
      if (!shared) return;
      await cache.delete("/shared-image");
      onImage(await shared.blob());
    });
  }, []);
}

export function Incoming(props: { enabled: boolean; onImage: (file: Blob) => void }) {
  const [over, setOver] = useState(false);
  const onImage = useRef(props.onImage);
  onImage.current = props.onImage;
  useEffect(() => {
    if (!props.enabled) return setOver(false);
    const paste = (e: ClipboardEvent) => {
      const file = image(e.clipboardData?.files);
      if (!file || (editable(e.target) && e.clipboardData?.types.includes("text/plain"))) return;
      e.preventDefault();
      onImage.current(file);
    };
    const hasImage = (e: DragEvent) => [...(e.dataTransfer?.items ?? [])].some((i) => i.kind === "file" && i.type.startsWith("image/"));
    const enter = (e: DragEvent) => hasImage(e) && (e.preventDefault(), setOver(true));
    const leave = (e: DragEvent) => !e.relatedTarget && setOver(false);
    const drop = (e: DragEvent) => {
      const file = image(e.dataTransfer?.files);
      setOver(false);
      if (!file) return;
      e.preventDefault();
      onImage.current(file);
    };
    addEventListener("paste", paste);
    addEventListener("dragover", enter);
    addEventListener("dragleave", leave);
    addEventListener("drop", drop);
    return () => {
      removeEventListener("paste", paste);
      removeEventListener("dragover", enter);
      removeEventListener("dragleave", leave);
      removeEventListener("drop", drop);
    };
  }, [props.enabled]);

  return (
    over &&
    createPortal(
      <div className="pointer-events-none fixed inset-3 z-50 grid place-items-center rounded-card border-2 border-dashed border-accent bg-bg/80 text-[17px] font-medium text-accent">
        Drop to add from the photo
      </div>,
      document.body,
    )
  );
}
