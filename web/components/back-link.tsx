import { Link } from "@tanstack/react-router";
import { Icon, paths } from "./icon";

export const BackToSettings = () => (
  <Link to="/settings" className="hit inline-flex items-center gap-1 text-ink2">
    <Icon d={paths.back} className="size-4 stroke-2" />
    Settings
  </Link>
);
