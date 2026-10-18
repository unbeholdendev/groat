import { Icon, paths } from "../../components/icon";

export const palette = { Rose: "#f16f7e", Tangerine: "#f98942", Sun: "#f4bf3f", Lime: "#99d352", Jade: "#3fbe90", Aqua: "#26c0cf", Orchid: "#bf73df", Pink: "#e977bb" };
const swatches = Object.values(palette);
const swatch = "relative grid aspect-square w-full max-w-8 place-items-center rounded-chip has-checked:ring-2 has-checked:ring-ink has-checked:ring-offset-2 has-checked:ring-offset-surface has-focus-visible:outline-2 has-focus-visible:outline-offset-4 has-focus-visible:outline-accent";

export function ColourPicker({ value, onChange, error }: { value: string; onChange: (color: string) => void; error?: string }) {
  const custom = !swatches.includes(value);
  return (
    <fieldset className="label">
      <legend className="mb-1.5">Colour</legend>
      <div className="grid grid-cols-9 gap-1.5 px-0.5">
        {Object.entries(palette).map(([name, color]) => (
          <label key={color} className={swatch} style={{ background: color }}>
            <input type="radio" name="colour" aria-label={name} className="sr-only" checked={value === color} onChange={() => onChange(color)} />
          </label>
        ))}
        <label className={`${swatch} border border-line2 ${custom ? "ring-2 ring-ink ring-offset-2 ring-offset-surface" : ""}`} style={{ background: custom ? value : undefined }}>
          <Icon d={paths.plus} className={`size-4 stroke-2 ${custom ? "text-white" : "text-ink3"}`} />
          <input type="color" aria-label="Custom colour" className="absolute inset-0 size-full cursor-pointer opacity-0" value={value} onChange={(e) => onChange(e.target.value)} />
        </label>
      </div>
      {error && <span className="text-up">{error}</span>}
    </fieldset>
  );
}
