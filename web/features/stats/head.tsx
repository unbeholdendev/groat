export const Head = ({ title, vs }: { title: string; vs: string | null }) => (
  <div className="mt-7 mb-3 flex items-baseline justify-between px-1">
    <h2 className="legend text-[13px] font-semibold text-ink2">{title}</h2>
    {vs && <span className="text-[12px] font-medium text-ink3">vs {vs}</span>}
  </div>
);
