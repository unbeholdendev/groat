import type { ReactNode } from "react";

export const paths = {
  expand: "M14 4h6v6M20 4l-6 6M10 20H4v-6M4 20l6-6",
  plus: "M12 5v14M5 12h14",
  close: "M6 6l12 12M18 6 6 18",
  chevron: "m6 9 6 6 6-6",
  back: "m15 6-6 6 6 6",
  chat: "M5 18.5V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H8.5z",
  bin: "M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12",
  repeat: "M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4",
};

export const Icon = ({ children, d, className = "size-[21px]" }: { children?: ReactNode; d?: string; className?: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden className={`${className} fill-none stroke-current stroke-[1.6] [stroke-linecap:round] [stroke-linejoin:round]`}>
    {d && <path d={d} />}
    {children}
  </svg>
);

export const Chevron = ({ className = "size-2.5 text-ink3" }: { className?: string }) => <Icon d={paths.chevron} className={className} />;
