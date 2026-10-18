import type { ReactNode } from "react";

export const Masthead = ({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) => (
  <header className={`-mx-5 rounded-b-hero bg-hero px-5 pt-[max(env(safe-area-inset-top),40px)] pb-7 text-on-hero shadow-hero lg:mx-0 lg:rounded-hero lg:pt-7 ${className}`}>
    <span aria-hidden className="grid size-12 place-items-center rounded-[14px] bg-on-hero/16">
      <span className="size-6 rounded-full border-[5px] border-on-hero" />
    </span>
    <h1 className="mt-6 text-display font-bold">{title}</h1>
    <p className="mt-2 text-on-hero2">{children}</p>
  </header>
);
