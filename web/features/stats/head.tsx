export const Head = ({ title, vs }: { title: string; vs: string }) => (
  <div className="mt-7 mb-3 flex items-baseline justify-between px-1">
    <h2 className="text-[20px] font-[650] tracking-[-0.02em]">{title}</h2>
    <span className="text-[12px] font-medium text-ink3">vs {vs}</span>
  </div>
);
