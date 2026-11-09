import { use, useEffect, useRef } from "react";
import { useLocation, useNavigate, useSearch } from "@tanstack/react-router";
import { TabBar } from "../../components/tab-bar";
import { useCategories } from "../../lib/api";
import type { Settings } from "../../lib/schemas";
import { UnitContext } from "../../lib/unit";
import { Bar } from "../quick-add/bar";

export function Dock({ settings, guide, onGuided }: { settings: Settings; guide: boolean; onGuided: () => void }) {
  const [unit] = use(UnitContext);
  const search = useSearch({ strict: false });
  const path = useLocation().pathname;
  const navigate = useNavigate();
  const categories = useCategories();
  const bar = !search.new && !search.edit;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const dock = ref.current!;
    const stack = dock.querySelector("[data-stack]");
    const root = document.documentElement;
    let last = 0;
    let own = dock.offsetHeight;
    const fit = () => {
      const lift = stack?.clientHeight ?? 0;
      const total = dock.offsetHeight + lift;
      const flowed = dock.offsetParent ? Math.max(dock.offsetHeight - own, 0) : 0;
      const end = innerHeight + scrollY >= root.scrollHeight - flowed - 1;
      root.style.setProperty("--dock", `${total}px`);
      root.style.setProperty("--stack", `${lift}px`);
      if (end && last && total > last) scrollBy(0, total - last);
      last = total;
      own = dock.offsetHeight;
    };
    const o = new ResizeObserver(fit);
    o.observe(dock);
    if (stack) o.observe(stack);
    return () => o.disconnect();
  }, [bar]);
  return (
    <div ref={ref} className="fixed inset-x-2 bottom-[max(env(safe-area-inset-bottom),8px)] z-10 mx-auto max-w-md p-2 max-lg:[view-transition-name:dock] lg:sticky lg:bottom-6 lg:mb-6">
      <div aria-hidden className={`glass absolute inset-0 -z-10 rounded-dock shadow-dock ${bar ? "" : "lg:hidden"}`} />
      {bar && (
        <Bar
          settings={settings}
          unit={unit}
          categories={categories}
          guide={guide}
          onGuided={onGuided}
          chat={path === "/chat" ? Number(search.id) || 0 : undefined}
          onForm={(draft) => navigate({ to: "/", search: { new: "1" }, state: { draft } })}
          onChat={(id) => id !== Number(search.id) && navigate({ to: "/chat", search: { id: String(id) }, state: { fromList: path === "/chat" } })}
        />
      )}
      <TabBar />
    </div>
  );
}
