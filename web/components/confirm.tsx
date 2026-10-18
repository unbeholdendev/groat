import type { ReactNode } from "react";
import { Button } from "./button";

export const Confirm = (props: { ask: ReactNode; yes: string; onYes: () => void; onNo: () => void }) => (
  <span className="rise inline-flex items-center gap-1 text-[13px] font-medium">
    <span className="text-ink2">{props.ask}</span>
    <Button autoFocus onClick={props.onNo}>
      Keep
    </Button>
    <Button tone="up" onClick={props.onYes}>
      {props.yes}
    </Button>
  </span>
);
