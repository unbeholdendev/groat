import type { ReactNode } from "react";

export const Masthead = ({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) => (
  <header className={`pt-[max(env(safe-area-inset-top),40px)] lg:pt-7 ${className}`}>
    <span aria-hidden className="grid size-12 place-items-center rounded-[14px] bg-accent">
      <span className="size-6 rounded-full border-[5px] border-on-accent" />
    </span>
    <span aria-hidden className="mt-7 flex h-1 justify-between">
      {Array.from({ length: 31 }, (_, i) => (
        <i key={i} className="size-[3px] rounded-full bg-line2" />
      ))}
    </span>
    <h1 className="mt-6 text-display font-bold">{title}</h1>
    <p className="mt-2 text-ink2">{children}</p>
  </header>
);
