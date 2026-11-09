import { useStorageWarning } from "../../lib/device";
import { Button } from "../../components/button";
import { Fragment } from "react";
import { Link } from "@tanstack/react-router";
import type { Unit } from "../../../shared/amount";
import { parse } from "../../../shared/parse";
import { Tile } from "../../components/category";
import { Icon, paths } from "../../components/icon";
import { useSession } from "../../lib/api";
import { money } from "../../lib/money";
import type { Settings } from "../../lib/schemas";
import { Tokens } from "./tokens";
import type { Receipt } from "./use-receipt";

export function aiOff(s: Settings, admin: boolean, feature: "ai" | "voice") {
  if (s.aiProblem) return s.aiProblem;
  if (!s.aiSource) return admin ? "AI isn’t set up yet. Turn it on in Settings." : "AI isn’t set up. Ask an admin to turn it on.";
  if (!s.ai) return admin ? "AI needs a chat model. Choose one in Settings." : "AI isn’t finished setting up. Ask an admin to choose a chat model.";
  if (feature === "voice") return admin ? "Dictation needs a speech-to-text model. Add one in Settings." : "Dictation isn’t set up. Ask an admin to add it.";
  return "";
}

export function Hint(props: {
  settings: Settings;
  unit: Unit;
  text: string;
  ask: boolean;
  p: ReturnType<typeof parse>;
  error: Error | null;
  receipt: Receipt;
  queued: number;
  guide: boolean;
  onUndo: () => void;
  onForm: () => void;
}) {
  const { settings, text, ask, p, receipt } = props;
  const shown = receipt.shown;
  const storageWarning = useStorageWarning();
  const admin = useSession()?.user?.role === "admin";
  const other = settings.recentCurrencies.find((c) => c !== "BTC" && c !== settings.lastCurrency);
  const examples = [other && `12 ${other.toLowerCase()}`, settings.recentCurrencies.includes("BTC") && "5000 sats", "#work"].filter((e) => typeof e === "string");
  return (
    <p
      onMouseEnter={() => receipt.setHold(true)}
      onMouseLeave={() => receipt.setHold(false)}
      onFocus={() => receipt.setHold(true)}
      onBlur={() => receipt.setHold(false)}
      className="flex min-h-7 items-center justify-between gap-3 px-1.5 pt-1.5 text-xs text-ink3"
    >
      {props.error ? (
        <span className="text-up">{props.error.message}</span>
      ) : ask ? (
        <span>Answers come from your own data. Expenses are only added once you review them.</span>
      ) : !settings.ai && text.startsWith("?") ? (
        <span>
          {aiOff(settings, admin, "ai")}
          {admin && (
            <>
              {" "}
              <Link to="/settings" className="font-medium text-accent">
                Open Settings
              </Link>
            </>
          )}
        </span>
      ) : text && settings.ai && !p.amount ? (
        <span>Press Enter to create an expense draft for review.</span>
      ) : text && !p.amount ? (
        <span>Add an amount, like 24.50, or press Enter for the full form.</span>
      ) : text ? (
        <span />
      ) : shown ? (
        <span key={shown.id} className="rise flex min-w-0 items-center gap-2 text-ink2">
          <Tile category={receipt.category} small />
          <span className="truncate">{`${shown.binned ? "Binned" : "Added"} ${shown.row.note}`.trim()}</span>·
          <span className="num shrink-0 text-ink">{money(shown.row.amount, shown.row.currency, props.unit)}</span>
          {!shown.row.id && <span className="shrink-0 text-ink3">· will sync</span>}
        </span>
      ) : props.queued > 0 ? (
        <span>{storageWarning ? "Not saved on this device. Keep this tab open." : "Offline. Saved here, will sync."}</span>
      ) : props.guide ? (
        <span className="text-ink2">Start with the last thing you paid for</span>
      ) : (
        <span className="min-w-0 [word-spacing:0.15em]">
          Try{" "}
          {examples.map((e, i) => (
            <Fragment key={e}>
              {i > 0 && " · "}
              <Tokens parts={parse(e, settings.recentCurrencies).parts} />
            </Fragment>
          ))}
          {settings.ai && (
            <>
              {" · "}
              <span className="whitespace-nowrap">
                Start with <kbd className="rounded-token border border-line2 bg-surface px-1 text-[11px] font-medium text-ink2">?</kbd> to ask
              </span>
            </>
          )}
        </span>
      )}
      {shown && !ask && !text ? (
        shown.row.id > 0 && (
          <Button variant="link" tone="accent" className="shrink-0" onClick={props.onUndo}>
            Undo
          </Button>
        )
      ) : (
        !ask &&
        p.amount && (
          <button
            type="button"
            aria-label="Full form"
            title="Full form"
            onMouseDown={(e) => e.preventDefault()}
            onClick={props.onForm}
            className="press hit -my-1 grid size-7 shrink-0 place-items-center rounded-chip text-ink2 hover:bg-surface2 hover:text-ink"
          >
            <Icon d={paths.expand} className="size-4 stroke-2" />
          </button>
        )
      )}
    </p>
  );
}
