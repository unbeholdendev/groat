import { useState } from "react";
import { z } from "zod";
import { Button } from "../../components/button";
import { Field, FormError, Input } from "../../components/form";
import { sectionHead } from "../../components/styles";
import { useApi, useSendNow } from "../../lib/api";

const status = z.object({ connected: z.boolean(), email: z.string().nullable(), model: z.string().nullable(), needsSignIn: z.boolean() });
const listing = z.object({ models: z.array(z.object({ slug: z.string(), display_name: z.string() })) });

export function Chatgpt() {
  const query = useApi(status, ["/api/chatgpt"], { throwOnError: false });
  const models = useApi(listing, ["/api/chatgpt/models"], { enabled: !!query.data?.connected && !query.data.needsSignIn, throwOnError: false });
  const mutation = useSendNow("chatgpt");
  const [url, setUrl] = useState("");
  const [callback, setCallback] = useState("");
  const [notice, setNotice] = useState("");
  const busy = mutation.isPending;
  return (
    <section className="flex flex-col gap-4">
      <h2 className={sectionHead}>ChatGPT subscription</h2>
      <p className="text-sm text-ink2">Use your ChatGPT plan for your own questions and receipt reading. Dictation needs a separate speech-to-text API provider.</p>
      {query.data?.connected && (
        <p className="text-sm">
          Connected as {query.data.email}. {query.data.needsSignIn && "Sign in again to continue."}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-ink2">
          {notice}
        </p>
      )}
      <FormError error={query.error ?? mutation.error ?? models.error} />
      <Button
        disabled={busy}
        onClick={() =>
          mutation.mutate(["POST", "/api/chatgpt/start"], {
            onSuccess: (data) => {
              setUrl(z.object({ url: z.string() }).parse(data).url);
              setCallback("");
            },
          })
        }
      >
        {busy ? "Working…" : query.data?.connected ? "Reconnect ChatGPT" : "Connect ChatGPT"}
      </Button>
      {url && (
        <>
          <a className="text-accent underline" href={url} target="_blank" rel="noreferrer">
            Continue with ChatGPT
          </a>
          <p className="text-sm text-ink2">
            After signing in, your browser will fail to open 127.0.0.1. Copy that page’s full address and paste it below within ten minutes. Keep this Groat tab open.
          </p>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              const value = callback;
              setCallback("");
              mutation.mutate(["POST", "/api/chatgpt/callback", { callback: value }], {
                onSuccess: () => {
                  setUrl("");
                  void query.refetch();
                  void models.refetch();
                },
              });
            }}
          >
            <Field label="Callback URL">
              <Input autoComplete="off" autoCapitalize="none" spellCheck={false} type="password" value={callback} onChange={(e) => setCallback(e.target.value)} />
            </Field>
            <Button type="submit" variant="primary" disabled={busy || !callback}>
              Finish connection
            </Button>
          </form>
        </>
      )}
      {query.data?.connected && !!models.data?.models.length && (
        <Field label="ChatGPT model">
          <select
            className="w-full rounded-xl bg-panel p-3 text-ink"
            value={query.data?.model ?? models.data.models[0].slug}
            disabled={busy}
            onChange={(e) =>
              mutation.mutate(["PUT", "/api/chatgpt/model", { model: e.target.value }], {
                onSuccess: () => {
                  void query.refetch();
                },
              })
            }
          >
            {models.data.models.map((m) => (
              <option key={m.slug} value={m.slug}>
                {m.display_name}
              </option>
            ))}
          </select>
        </Field>
      )}
      {query.data?.connected && (
        <Button
          disabled={busy}
          onClick={() =>
            mutation.mutate(["DELETE", "/api/chatgpt"], {
              onSuccess: (data) => {
                setUrl("");
                setCallback("");
                setNotice(
                  z.object({ revocationConfirmed: z.boolean() }).parse(data).revocationConfirmed
                    ? "ChatGPT disconnected."
                    : "Disconnected here. Revocation could not be confirmed; remove Groat in ChatGPT Settings to end remote access.",
                );
                void query.refetch();
              },
            })
          }
        >
          Disconnect ChatGPT
        </Button>
      )}
    </section>
  );
}
