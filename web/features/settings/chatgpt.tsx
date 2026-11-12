import { useState } from "react";
import { paths } from "../../components/icon";
import { z } from "zod";
import { Button } from "../../components/button";
import { Field, FormError, Input } from "../../components/form";
import { panel, subHead } from "../../components/styles";
import { useApi, useSendNow } from "../../lib/api";
import { SelectRow } from "./select-row";

const status = z.object({
  connected: z.boolean(),
  email: z.string().nullable(),
  model: z.string().nullable(),
  needsSignIn: z.boolean(),
  signIn: z.string().nullable(),
});
const listing = z.object({ models: z.array(z.object({ slug: z.string(), display_name: z.string() })) });

export function Chatgpt({ keyInUse }: { keyInUse: boolean }) {
  const query = useApi(status, ["/api/chatgpt"], { throwOnError: false });
  const usable = !!query.data?.connected && !query.data.needsSignIn;
  const models = useApi(listing, ["/api/chatgpt/models"], { enabled: usable, throwOnError: false });
  const mutation = useSendNow("chatgpt");
  const [callback, setCallback] = useState("");
  const [notice, setNotice] = useState("");
  const [confirming, setConfirming] = useState(false);
  const busy = mutation.isPending;
  const data = query.data;
  const signIn = data?.signIn;
  function run(...args: Parameters<typeof mutation.mutate>) {
    setNotice("");
    mutation.mutate(...args);
  }
  const chosen = models.data?.models.find((m) => m.slug === data?.model) ?? models.data?.models[0];
  return (
    <div className="flex flex-col gap-3">
      <h3 className={subHead}>ChatGPT plan</h3>
      <p className="px-1 text-sm text-ink2">{planStatus(data, keyInUse)}</p>
      {notice && (
        <p role="status" className="px-1 text-sm text-ink2">
          {notice}
        </p>
      )}
      {usable && !!models.data?.models.length && chosen && (
        <div className={panel}>
          <SelectRow
            label="Model"
            icon={<path d={paths.chat} />}
            value={chosen.slug}
            shown={chosen.display_name}
            onChange={(model) => run(["PUT", "/api/chatgpt/model", { model }])}
          >
            {models.data.models.map((m) => (
              <option key={m.slug} value={m.slug}>
                {m.display_name}
              </option>
            ))}
          </SelectRow>
        </div>
      )}
      <FormError error={query.error ?? mutation.error ?? models.error} className="px-1" />
      {actions()}
    </div>
  );

  function actions() {
    if (signIn)
      return (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(["POST", "/api/chatgpt/callback", { callback }], { onSuccess: () => setCallback("") });
          }}
        >
          <ol className="flex list-decimal flex-col gap-1.5 pl-6 text-sm text-ink2">
            <li>
              <a
                className="font-medium text-accent underline underline-offset-2"
                href={signIn}
                target="_blank"
                rel="noreferrer"
              >
                Sign in to ChatGPT
              </a>{" "}
              in a new tab.
            </li>
            <li>Afterwards the browser shows an error page at 127.0.0.1. That’s expected.</li>
            <li>Copy that page’s whole address and paste it here within ten minutes.</li>
          </ol>
          <Field label="Address of the error page">
            <Input
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              inputMode="url"
              placeholder="http://127.0.0.1:1455/auth/callback?…"
              value={callback}
              onChange={(e) => {
                mutation.reset();
                setCallback(e.target.value);
              }}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button onClick={() => run(["DELETE", "/api/chatgpt/start"])} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={busy || !callback.trim()}>
              {busy ? "Connecting…" : "Finish connecting"}
            </Button>
          </div>
        </form>
      );
    if (confirming)
      return (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <p className="mr-auto px-1 text-sm">Disconnect ChatGPT? AI turns off for everyone until you connect again.</p>
          <Button onClick={() => setConfirming(false)}>Keep it</Button>
          <Button
            tone="up"
            disabled={busy}
            onClick={() =>
              run(["DELETE", "/api/chatgpt"], {
                onSuccess: (result) => {
                  setConfirming(false);
                  setNotice(
                    z.object({ revocationConfirmed: z.boolean() }).parse(result).revocationConfirmed
                      ? "ChatGPT disconnected."
                      : "Disconnected here, but ChatGPT didn’t confirm it. Remove Groat in ChatGPT’s settings to end its access.",
                  );
                },
              })
            }
          >
            Disconnect
          </Button>
        </div>
      );
    return (
      <div className="flex justify-end gap-2">
        {data?.connected && <Button onClick={() => setConfirming(true)}>Disconnect</Button>}
        <Button
          variant={(data?.connected && !data.needsSignIn) || keyInUse ? "text" : "primary"}
          tone="accent"
          disabled={busy || !data}
          onClick={() => run(["POST", "/api/chatgpt/start"])}
        >
          {connectLabel(busy, !!data?.connected)}
        </Button>
      </div>
    );
  }
}

function planStatus(data: z.infer<typeof status> | undefined, keyInUse: boolean) {
  if (data?.connected)
    return data.needsSignIn
      ? `The sign-in for ${data.email} has expired, so AI is off. Reconnect to turn it back on.`
      : `Connected as ${data.email}. Everyone on this server uses this plan.`;
  return keyInUse
    ? "Connecting a ChatGPT plan moves asking and receipts to it for everyone. The API key stays for dictation."
    : "Connect a ChatGPT plan and everyone on this server can ask questions and read receipts with it.";
}

function connectLabel(busy: boolean, connected: boolean) {
  if (busy) return "Starting…";
  return connected ? "Reconnect" : "Connect ChatGPT";
}
