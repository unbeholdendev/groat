import { Icon, paths } from "../../components/icon";
import type { Tag } from "./tags";

export const TagChip = ({ tag, onRename, onDelete }: { tag: Tag; onRename: () => void; onDelete: () => void }) => (
  <li className="flex items-center rounded-chip border border-line2 bg-surface">
    <button className="hit py-1 pr-1 pl-2.5" onClick={onRename}>
      #{tag.name}
    </button>
    <button
      className="relative grid h-7 w-9 place-items-center text-ink3 before:absolute before:-inset-y-2 before:left-0 before:-right-2 hover:text-up"
      onClick={onDelete}
      aria-label={`Delete #${tag.name}`}
    >
      <Icon d={paths.close} className="size-3.5 stroke-2" />
    </button>
  </li>
);
