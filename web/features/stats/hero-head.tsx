import { Link } from "@tanstack/react-router";
import { Input } from "../../components/form";
import { Icon, paths } from "../../components/icon";
import { Segmented } from "../../components/segmented";

export const presets = ["This month", "Last month", "Year to date", "Custom"] as const;
export type Preset = (typeof presets)[number];
export const tagPresets = ["Whole tag", "Custom"] as const;

export function HeroHead<T extends string>(props: {
  presets: readonly T[];
  preset: T;
  range: [string, string];
  tag?: string;
  onPreset: (p: T) => void;
  onRange: (from: string, to: string) => void;
}) {
  const [from, to] = props.range;
  return (
    <>
      <h1 className="text-display font-bold">Stats</h1>
      {props.tag && (
        <div className="mt-3 flex items-center justify-between text-[13px] font-medium">
          <span className="flex items-center rounded-chip border border-line2 bg-surface">
            <span className="py-1 pr-1 pl-2.5">#{props.tag}</span>
            <Link
              to="/stats"
              aria-label={`Show all stats, not just #${props.tag}`}
              className="relative grid h-7 w-9 place-items-center text-ink3 before:absolute before:-inset-y-2 before:left-0 before:-right-2 hover:text-ink"
            >
              <Icon d={paths.close} className="size-3.5 stroke-2" />
            </Link>
          </span>
          <Link to="/" search={{ tag: props.tag, from, to }} className="hit text-accent">
            See transactions
          </Link>
        </div>
      )}
      <div className="mt-4">
        <Segmented label="Period" options={props.presets} value={props.preset} onChange={props.onPreset} />
      </div>
      {props.preset === "Custom" && (
        <div className="mt-3 flex gap-2">
          <label className="label min-w-0 flex-1">
            From
            <Input type="date" max={to} value={from} onChange={(e) => props.onRange(e.target.value, to)} />
          </label>
          <label className="label min-w-0 flex-1">
            To
            <Input type="date" min={from} value={to} onChange={(e) => props.onRange(from, e.target.value)} />
          </label>
        </div>
      )}
    </>
  );
}
