import { Icon, paths } from "../../components/icon";

const glyphs = { Ask: "M12 19V5M6 11l6-6 6 6", Add: "M20 5v7a3 3 0 0 1-3 3H5M9 11l-4 4 4 4", "Full form": paths.plus };

export const SubmitButton = ({ name, disabled, dim }: { name: keyof typeof glyphs; disabled: boolean; dim: boolean }) => (
  <button
    aria-label={name}
    disabled={disabled}
    className={`press hit grid size-10 shrink-0 place-items-center rounded-chip transition-[scale,background-color,color] duration-200 disabled:opacity-50 ${dim ? "text-ink3" : name === "Full form" ? "bg-accent-soft text-accent" : "bg-accent text-on-accent"}`}
  >
    <Icon key={name} d={glyphs[name]} className="size-[18px] stroke-2 transition-[scale,opacity] duration-300 ease-out starting:scale-50 starting:opacity-0" />
  </button>
);
