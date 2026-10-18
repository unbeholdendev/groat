import { useState } from "react";
import { Button } from "../../components/button";

export function TokenSecret({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rise mb-3 rounded-panel bg-amber-soft p-4 text-sm">
      <p className="font-medium text-amber">Copy it now. It won’t be shown again.</p>
      <div className="mt-2 flex items-center gap-2">
        <code className="num min-w-0 flex-1 truncate">{token}</code>
        <Button variant="quiet" className="h-9 bg-surface text-[13px]" onClick={() => navigator.clipboard.writeText(token).then(() => setCopied(true))}>
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}
