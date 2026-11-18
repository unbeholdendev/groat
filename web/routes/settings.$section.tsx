import { createFileRoute } from "@tanstack/react-router";
import { SectionPage } from "../features/settings/section-page";

export const Route = createFileRoute("/settings/$section")({
  component: () => <SectionPage id={Route.useParams().section} />,
});
