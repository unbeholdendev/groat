import type { Part } from "../../../shared/parse";

export const pill = "glass relative inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-chip px-3 text-[13px] font-medium text-ink shadow-dock has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent";

const styles = {
  tag: "rounded-token bg-track text-ink2 shadow-[0_0_0_2px_var(--track)]",
  amount: "rounded-token bg-accent-soft text-accent shadow-[0_0_0_2px_var(--accent-soft)]",
  currency: "text-accent",
  "": "",
};

export const Tokens = ({ parts }: { parts: Part[] }) =>
  parts.map(([w, kind], i) => (
    <span key={i} className={styles[kind]}>
      {w}
    </span>
  ));
