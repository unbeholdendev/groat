import { Pill } from "../../components/total";
import { change } from "../../lib/period";

export function Delta(props: { now: number; before: number; pad: boolean; show: (n: number) => string }) {
  const d = change(props.now, props.before, props.show);
  return (d || props.pad) && <span className="min-w-11 shrink-0 text-right text-[12px]">{d && <Pill d={d} />}</span>;
}
