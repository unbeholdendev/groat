import { Button } from "../../components/button";
import { useState } from "react";
import { Confirm } from "../../components/confirm";
import { Chevron } from "../../components/icon";

export function ChatHeader({ back, onBack, onDelete }: { back: string; onBack: () => void; onDelete?: () => void }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="flex items-center justify-between">
      <button type="button" className="hit inline-flex items-center gap-1 text-ink2" onClick={onBack}>
        <Chevron className="size-4 rotate-90 text-ink2" />
        {back}
      </button>
      {onDelete &&
        (confirming ? (
          <Confirm ask="Delete this chat?" yes="Delete" onYes={() => (setConfirming(false), onDelete())} onNo={() => setConfirming(false)} />
        ) : (
          <Button variant="link" tone="up" className="text-sm" onClick={() => setConfirming(true)}>
            Delete
          </Button>
        ))}
    </div>
  );
}
