export const ShareBar = ({ share, color, builtin, index, className }: { share: number; color: string; builtin?: boolean; index: number; className: string }) => (
  <span className={`overflow-hidden rounded-chip bg-track ${className}`}>
    <span
      className="block h-full origin-left animate-fill rounded-chip"
      style={{ width: `${share * 100}%`, background: builtin ? "var(--ink3)" : color, animationDelay: `${index * 30}ms` }}
    />
  </span>
);
