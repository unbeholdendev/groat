import { Link } from "@tanstack/react-router";
import { Icon } from "../../components/icon";
import { divide } from "../../components/styles";
import { Delta } from "./delta";
import { Head } from "./head";
import { type Period, row } from "./types";

export function ByTag({ now, prev, range: [from, to], vs, show }: { now: Period; prev: Period; range: [string, string]; vs: string; show: (n: number) => string }) {
  if (now.tags.length === 0) return null;
  return (
    <>
      <Head title="By tag" vs={vs} />
      <ul className="overflow-hidden rounded-panel bg-surface shadow-panel">
        {now.tags.map((t) => (
          <li key={t.name} className={divide}>
            <Link to="/" search={{ tag: t.name, from, to }} className={`${row} press h-[62px]`}>
              <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-tile bg-track text-ink3">
                <Icon className="size-[18px] stroke-2">
                  <path d="M9 4 7 20M17 4l-2 16M4 9h16M3 15h16" />
                </Icon>
              </span>
              <span className="min-w-0 flex-1 truncate font-medium">{t.name}</span>
              <span className="num">{show(t.total)}</span>
              <Delta now={t.total} before={prev.tags.find((r) => r.name === t.name)?.total ?? 0} pad={prev.total > 0} />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
