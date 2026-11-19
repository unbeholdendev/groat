import { Link } from "@tanstack/react-router";
import { FormError } from "../../components/form";
import { Icon, paths } from "../../components/icon";
import { panel } from "../../components/styles";
import { useMarkRead, useUnread } from "./unread";

export function CheckInCard() {
  const [latest] = useUnread();
  const reading = useMarkRead();
  if (!latest) return <FormError error={reading.error} className="mt-5" />;
  return (
    <div className={`${panel} mt-5 flex items-center gap-3 pl-4`}>
      <Icon d={paths.chat} className="size-5 shrink-0 text-accent" />
      <Link to="/chat" search={{ id: String(latest.id) }} className="press min-w-0 flex-1 py-3">
        <span className="block truncate font-medium">{latest.title}</span>
        <span className="block text-xs text-ink3">New from your weekly check-in</span>
      </Link>
      <button
        type="button"
        aria-label="Dismiss"
        className="press hit px-4 py-3 text-ink3"
        onClick={() => reading.mutate(latest.id)}
      >
        <Icon d={paths.close} className="size-4" />
      </button>
    </div>
  );
}
