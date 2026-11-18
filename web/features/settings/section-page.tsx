import { Navigate } from "@tanstack/react-router";
import { BackToSettings } from "../../components/back-link";
import { useSession } from "../../lib/api";
import { sectionsFor } from "./sections";

export function SectionPage({ id }: { id: string }) {
  const admin = useSession()?.user?.role === "admin";
  const section = sectionsFor(admin).find((s) => s.id === id);
  if (!section) return <Navigate to="/settings" replace />;
  return (
    <>
      <BackToSettings />
      <h1 className="mt-4 mb-5 text-display font-bold lg:mt-0">{section.label}</h1>
      <section.Page admin={admin} />
    </>
  );
}
