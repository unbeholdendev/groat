import { useEffect, useState } from "react";
import { Icon } from "../../components/icon";

export function recording(audio: Blob) {
  const form = new FormData();
  form.append("audio", audio, `voice.${/^audio\/(\w+)/.exec(audio.type)?.[1] ?? "webm"}`);
  return form;
}

export function Mic(props: { onAudio: (audio: Blob) => void; onError: (e: Error) => void; off?: string }) {
  const [recorder, setRecorder] = useState<MediaRecorder | null>(null);

  useEffect(() => {
    if (!recorder) return;
    const cap = setTimeout(() => recorder.stop(), 30_000);
    return () => {
      clearTimeout(cap);
      if (recorder.state === "recording") recorder.stop();
    };
  }, [recorder]);

  async function start() {
    const stream = await navigator.mediaDevices?.getUserMedia({ audio: true }).catch(() => undefined);
    if (!stream) return props.onError(new Error("The microphone is blocked. Allow it in your browser settings to dictate."));
    const r = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    r.ondataavailable = (e) => chunks.push(e.data);
    r.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      setRecorder(null);
      props.onAudio(new Blob(chunks, { type: r.mimeType }));
    };
    r.start();
    setRecorder(r);
  }

  return (
    <button
      type="button"
      aria-label={recorder ? "Stop recording" : "Dictate"}
      aria-pressed={!!recorder}
      aria-disabled={!!props.off}
      onClick={() => (props.off ? props.onError(new Error(props.off)) : recorder ? recorder.stop() : start())}
      className={`press hit grid size-10 shrink-0 place-items-center rounded-chip transition-[scale,background-color,color] duration-200 ${recorder ? "animate-pulse bg-up text-on-accent" : props.off ? "text-ink3 opacity-50" : "text-ink2"}`}
    >
      <Icon className="size-[18px] stroke-2">
        {recorder ? <rect x="7" y="7" width="10" height="10" rx="2" className="fill-current" /> : <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3ZM5 11a7 7 0 0 0 14 0M12 18v3" />}
      </Icon>
    </button>
  );
}
