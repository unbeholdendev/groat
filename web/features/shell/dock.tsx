import { use } from "react";
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
  return (
    <div className="fixed inset-x-2 bottom-[max(env(safe-area-inset-bottom),8px)] z-10 mx-auto max-w-md p-2 max-lg:[view-transition-name:dock] lg:sticky lg:bottom-6">
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
          onChat={(id) => navigate({ to: "/chat", search: { id: String(id) } })}
        />
      )}
      <TabBar />
    </div>
  );
}
