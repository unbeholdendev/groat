import { type CSSProperties, Fragment } from "react";
import type { Category } from "../lib/schemas";
import { Icon } from "./icon";

export const Tile = ({ category, small }: { category?: { icon: string; color: string; builtin?: boolean }; small?: boolean }) => (
  <span
    aria-hidden
    className={`tile ${small ? "size-7 rounded-[9px] text-[15px]" : "size-9 text-[19px]"}`}
    style={{ "--c": category && !category.builtin ? category.color : undefined } as CSSProperties}
  >
    {category && !category.builtin ? (
      category.icon
    ) : (
      <Icon className={`${small ? "size-4" : "size-5"} stroke-[1.8] text-ink3`}>
        <circle cx="12" cy="12" r="7.5" strokeDasharray="3 3.3" />
      </Icon>
    )}
  </span>
);

export function CategoryOptions({ categories, except }: { categories: Category[]; except?: number }) {
  const children = (id: number | null) => categories.filter((c) => c.parentId === id && c.id !== except);
  return children(null).map((p) => (
    <Fragment key={p.id}>
      <option value={p.id}>
        {p.icon} {p.name}
      </option>
      {children(p.id).map((c) => (
        <option key={c.id} value={c.id}>
          {"   "}
          {c.icon} {c.name}
        </option>
      ))}
    </Fragment>
  ));
}
