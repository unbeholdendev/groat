import { createFileRoute } from "@tanstack/react-router";
import { Privacy } from "../features/settings/privacy";

export const Route = createFileRoute("/settings/privacy")({ component: Privacy });
