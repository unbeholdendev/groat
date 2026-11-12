export function Segmented<T extends string>(props: {
  label: string;
  options: readonly T[];
  names?: Record<T, string>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={props.label} className="relative flex h-10 rounded-chip bg-track p-1">
      <span
        aria-hidden
        className="absolute inset-y-1 left-1 rounded-chip bg-surface shadow-thumb transition-transform duration-[260ms] ease-out dark:bg-line2"
        style={{
          width: `calc((100% - 8px) / ${props.options.length})`,
          transform: `translateX(${props.options.indexOf(props.value) * 100}%)`,
        }}
      />
      {props.options.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={props.value === o}
          onClick={() => props.onChange(o)}
          className={`hit press relative flex-1 rounded-chip text-[13px] font-medium whitespace-nowrap transition-colors ${props.value === o ? "text-ink" : "text-ink2"}`}
        >
          {props.names?.[o] ?? o}
        </button>
      ))}
    </div>
  );
}
