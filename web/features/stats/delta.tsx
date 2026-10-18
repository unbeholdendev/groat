import { change } from "../../lib/period";

export function Delta({ now, before, pad }: { now: number; before: number; pad: boolean }) {
  const d = change(now, before);
  return (d || pad) && <span className={`num w-11 shrink-0 text-right text-[12px] ${d?.tone ?? ""}`}>{d?.text}</span>;
}
