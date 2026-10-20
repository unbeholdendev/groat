import { Input } from "../../components/form";
import { Segmented } from "../../components/segmented";

export const presets = ["This month", "Last month", "Year to date", "Custom"] as const;
export type Preset = (typeof presets)[number];

export function HeroHead(props: { preset: Preset; range: [string, string]; onPreset: (p: Preset) => void; onRange: (from: string, to: string) => void }) {
  const [from, to] = props.range;
  return (
    <>
      <h1 className="text-display font-bold">Stats</h1>
      <div className="mt-4">
        <Segmented label="Period" options={presets} value={props.preset} onChange={props.onPreset} />
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
