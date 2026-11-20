import { createFileRoute } from "@tanstack/react-router";
import { StatsPage } from "../features/stats/stats-page";
import { dated, pick } from "../../shared/dates";

export const Route = createFileRoute("/stats")({
  validateSearch: (s) => pick(s, { from: dated, to: dated, tag: /./ }),
  component: StatsPage,
});
