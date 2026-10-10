import { createFileRoute } from "@tanstack/react-router";
import { SettingsForm, useSettings } from "../shared";

export const Route = createFileRoute("/settings")({
  component: () => <SettingsForm settings={useSettings()!} path="/api/settings" method="PUT" title="Settings" />,
});
