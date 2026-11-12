import { createContext, use } from "react";
import { useLocation, useNavigate, useSearch } from "@tanstack/react-router";
import { useCategories, useSettings } from "../../lib/api";
import { UnitContext } from "../../lib/unit";
import { Bar } from "./bar";

export const QuickAddContext = createContext<{
  guide: boolean;
  onGuided: () => void;
  host: HTMLDivElement | null;
  onHost: (host: HTMLDivElement | null) => void;
}>({ guide: false, onGuided: () => {}, host: null, onHost: () => {} });

export function QuickAdd() {
  const settings = useSettings()!;
  const [unit] = use(UnitContext);
  const { guide, onGuided, host } = use(QuickAddContext);
  const search = useSearch({ strict: false });
  const path = useLocation().pathname;
  const navigate = useNavigate();
  const categories = useCategories();
  const inline = path === "/" && !search.new && !search.edit && !search.view && host !== null;
  return (
    <Bar
      inline={inline}
      target={inline ? host : undefined}
      settings={settings}
      unit={unit}
      categories={categories}
      guide={guide}
      onGuided={onGuided}
      chat={path === "/chat" ? Number(search.id) || 0 : undefined}
      onForm={(draft) => navigate({ to: "/", search: { new: "1" }, state: { draft } })}
      onChat={(id) =>
        id !== Number(search.id) &&
        navigate({ to: "/chat", search: { id: String(id) }, state: { fromList: path === "/chat" } })
      }
    />
  );
}
