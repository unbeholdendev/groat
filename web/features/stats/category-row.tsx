import { Link } from "@tanstack/react-router";
import { Tile } from "../../components/category";
import { Chevron } from "../../components/icon";
import { divide } from "../../components/styles";
import type { Category } from "../../lib/schemas";
import { Delta } from "./delta";
import { ShareBar } from "../../components/share-bar";
import { list, row, type Slice } from "./types";

export function CategoryRow(props: {
  slice: Slice;
  index: number;
  total: number;
  before?: Slice;
  pad: boolean;
  tile: (id: number) => Category | undefined;
  range: [string, string];
  show: (n: number) => string;
  open: boolean;
  onToggle: () => void;
}) {
  const { slice: c, before, pad, tile, range, show, open } = props;
  const subs = c.children.some((k) => k.id !== c.id);
  const t = tile(c.id);
  const share = c.total / props.total;
  const cells = (
    <>
      <Tile category={t ?? c} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="truncate font-medium">{c.name}</span>
          {subs && <Chevron className={`size-3.5 shrink-0 self-center text-ink3 transition-transform ${open ? "rotate-180" : ""}`} />}
          <span className="num ml-auto">{show(c.total)}</span>
          <Delta now={c.total} before={before?.total ?? 0} pad={pad} />
        </span>
        <span className="mt-2 flex items-center gap-2.5">
          <ShareBar share={share} color={c.color} builtin={t?.builtin} index={props.index} className="h-1.5 flex-1" />
          <span className="num w-9 text-right text-[12px] text-ink3">{Math.round(share * 100)}%</span>
        </span>
      </span>
    </>
  );
  return (
    <li className={divide}>
      {subs ? (
        <button className={`${row} press py-3`} aria-expanded={open} onClick={props.onToggle}>
          {cells}
        </button>
      ) : (
        <Link {...list(c.id, range)} className={`${row} press py-3`}>
          {cells}
        </Link>
      )}
      {open && (
        <ul className="rise pb-1 pl-12">
          {c.children.map((k) => {
            const inner = (
              <>
                <Tile category={tile(k.id) ?? k} small />
                <span className="min-w-0 flex-1 truncate">{k.id === c.id ? `${k.name}, general` : k.name}</span>
                <span className="num">{show(k.total)}</span>
                <Delta now={k.total} before={before?.children.find((b) => b.id === k.id)?.total ?? 0} pad={pad} />
              </>
            );
            return (
              <li key={k.id}>
                {k.id === c.id ? (
                  <div className={`${row} h-12 hover:bg-transparent`}>{inner}</div>
                ) : (
                  <Link {...list(k.id, range)} className={`${row} h-12`}>
                    {inner}
                  </Link>
                )}
              </li>
            );
          })}
          <li>
            <Link {...list(c.id, range)} className={`${row} h-12 text-[13px] font-medium text-accent`}>
              All {c.name} expenses
            </Link>
          </li>
        </ul>
      )}
    </li>
  );
}
