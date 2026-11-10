import { use, useEffect, useRef } from "react";
import { useLocation, useSearch } from "@tanstack/react-router";
import { TabBar } from "../../components/tab-bar";
import { QuickAdd, QuickAddContext } from "../quick-add/quick-add";

export function Dock() {
  const { host } = use(QuickAddContext);
  const search = useSearch({ strict: false });
  const path = useLocation().pathname;
  const inline = path === "/" && !search.new && !search.edit && !search.view;
  const bar = !search.new && !search.edit && !inline;
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
  }, [bar, host]);
  return (
    <footer ref={ref} className={`sticky bottom-0 z-10 shrink-0 border-t border-line bg-surface px-2 pt-2 pb-[max(env(safe-area-inset-bottom),8px)] max-lg:[view-transition-name:dock] max-lg:shadow-lift lg:mx-auto lg:mb-4 lg:w-full lg:max-w-md lg:rounded-panel lg:border lg:shadow-panel ${!bar ? "lg:contents" : ""}`}>
      <div className="mx-auto max-w-md">
        {!search.new && !search.edit && <QuickAdd />}
        <TabBar />
      </div>
    </footer>
  );
}
