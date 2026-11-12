import type { ComponentProps } from "react";

const variants = {
  primary: "primary",
  quiet: "quiet",
  text: "press hit rounded-chip px-2.5 py-1.5 text-[13px] font-medium aria-expanded:bg-surface2 aria-expanded:text-ink",
  link: "press hit font-medium",
};
const tones = { ink2: "text-ink2", up: "text-up", accent: "text-accent" };

export type ButtonProps = ComponentProps<"button"> & { variant?: keyof typeof variants; tone?: keyof typeof tones };

export const Button = ({ variant = "text", tone = "ink2", type = "button", className = "", ...props }: ButtonProps) => (
  <button
    type={type}
    className={`${variants[variant]} ${variant === "text" || variant === "link" ? tones[tone] : ""} ${className}`}
    {...props}
  />
);
