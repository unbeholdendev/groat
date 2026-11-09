import { use, useEffect, useRef } from "react";
import { useLocation, useNavigate, useSearch } from "@tanstack/react-router";
import { TabBar } from "../../components/tab-bar";
import { useCategories, useSettings } from "../../lib/api";
import { UnitContext } from "../../lib/unit";
import { Bar } from "../quick-add/bar";

export function Dock({ guide, onGuided }: { guide: boolean; onGuided: () => void }) {
  const settings = useSettings()!;
  const [unit] = use(UnitContext);
  const search = useSearch({ strict: false });
  const path = useLocation().pathname;
  const navigate = useNavigate();
  const categories = useCategories();
  const bar = !search.new && !search.edit;
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const dock = ref.current!;
    const stack = dock.querySelector("[data-stack]");
    const root = document.documentElement;
    const fit = () => root.style.setProperty("--stack", `${stack?.clientHeight ?? 0}px`);
    const o = new ResizeObserver(fit);
    o.observe(dock);
    if (stack) o.observe(stack);
    return () => { o.disconnect(); root.style.removeProperty("--stack"); };
  }, [bar]);
  return (
    <footer ref={ref} className="sticky bottom-0 z-10 shrink-0 border-t border-line bg-surface px-2 pt-2 pb-[max(env(safe-area-inset-bottom),8px)] max-lg:[view-transition-name:dock] lg:mx-auto lg:mb-4 lg:w-full lg:max-w-md lg:rounded-panel lg:border lg:shadow-panel">
      <div className="mx-auto max-w-md">
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
    </footer>
  );
}
