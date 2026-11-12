import { useState } from "react";
import { Button } from "../../components/button";

function Copy({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="quiet"
      className="h-9 shrink-0 bg-surface text-[13px]"
      onClick={() => navigator.clipboard.writeText(text).then(() => setCopied(true))}
    >
      {copied ? "Copied" : label}
    </Button>
  );
}

export function TokenSecret({ token }: { token: string }) {
  const curl = `curl -X POST ${location.origin}/api/capture \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{"text": "coffee 4.50"}'`;
  return (
    <div className="rise mb-3 rounded-panel bg-amber-soft p-4 text-sm">
      <p className="font-medium text-amber">Copy it now. It won’t be shown again.</p>
      <div className="mt-2 flex items-center gap-2">
        <code className="num min-w-0 flex-1 truncate">{token}</code>
        <Copy text={token} />
      </div>
      <p className="mt-3 text-ink2">Try it. This adds a 4.50 coffee:</p>
      <pre className="num mt-2 overflow-x-auto rounded-tile bg-surface p-3 text-[12px]">{curl}</pre>
      <div className="mt-2 flex justify-end">
        <Copy text={curl} label="Copy command" />
      </div>
    </div>
  );
}
