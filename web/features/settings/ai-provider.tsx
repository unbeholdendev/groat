import { useState } from "react";
import { Button } from "../../components/button";
import { Field, FormError, Input } from "../../components/form";
import { subHead } from "../../components/styles";
import { useApi, useSendNow } from "../../lib/api";
import { type AiProvider as Saved, aiProvider } from "../../lib/schemas";

const savedKey = (ending: string | null) =>
  ending !== null && (
    <p className="text-sm text-ink2">
      {ending ? `Saved key ends in ${ending}.` : "A key is saved."} Leave blank to keep it.
    </p>
  );

export function AiProvider({ dictationOnly }: { dictationOnly: boolean }) {
  const query = useApi(aiProvider, ["/api/ai"], { throwOnError: false });
  return (
    <div className="flex flex-col gap-3">
      <h3 className={subHead}>{dictationOnly ? "Dictation" : "API key"}</h3>
      <FormError error={query.error} className="px-1" />
      {query.isError && (
        <button type="button" className="press text-accent" onClick={() => void query.refetch()}>
          Try again
        </button>
      )}
      {query.data && <ProviderForm key={JSON.stringify(query.data)} saved={query.data} dictationOnly={dictationOnly} />}
    </div>
  );
}

function ProviderForm({ saved, dictationOnly }: { saved: Saved; dictationOnly: boolean }) {
  const mutation = useSendNow("ai");
  const [baseUrl, setBaseUrl] = useState(saved.baseUrl ?? "");
  const [key, setKey] = useState("");
  const [sttBaseUrl, setSttBaseUrl] = useState(saved.sttBaseUrl ?? "");
  const [sttKey, setSttKey] = useState("");
  const [removeSttKey, setRemoveSttKey] = useState(false);
  const edit = (set: (value: string) => void) => (e: { target: { value: string } }) => (
    mutation.reset(), set(e.target.value)
  );
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate(
          [
            "PUT",
            "/api/ai",
            { baseUrl, sttBaseUrl, ...(key && { key }), ...(sttKey ? { sttKey } : removeSttKey && { sttKey: "" }) },
          ],
          { onSuccess: () => (setKey(""), setSttKey("")) },
        );
      }}
    >
      <p className="px-1 text-sm text-ink2">
        {dictationOnly
          ? "ChatGPT doesn’t offer speech-to-text. Add an OpenAI-compatible API key to turn on dictation. Asking and receipts keep using ChatGPT."
          : "Instead of a ChatGPT plan, any OpenAI-compatible API can power asking, receipt photos and dictation. Clear the base URL to remove it."}
      </p>
      <Field label="Base URL">
        <Input
          type="url"
          inputMode="url"
          autoCapitalize="none"
          placeholder="https://api.openai.com/v1"
          value={baseUrl}
          onChange={edit(setBaseUrl)}
        />
      </Field>
      <Field label="API key">
        <Input type="password" autoComplete="off" value={key} onChange={edit(setKey)} />
      </Field>
      {savedKey(saved.keyEnding)}
      {(!dictationOnly || saved.sttBaseUrl || saved.sttKeyEnding !== null) && (
        <>
          <Field label="Speech-to-text URL (optional)">
            <Input
              type="url"
              inputMode="url"
              autoCapitalize="none"
              placeholder="Same as the base URL"
              value={sttBaseUrl}
              onChange={edit(setSttBaseUrl)}
            />
          </Field>
          <Field label="Speech-to-text key (optional)">
            <Input
              type="password"
              autoComplete="off"
              placeholder="Same as the API key"
              value={sttKey}
              onChange={edit(setSttKey)}
              disabled={removeSttKey}
            />
          </Field>
          {saved.sttKeyEnding !== null &&
            (removeSttKey ? (
              <p className="text-sm text-ink2">
                The speech-to-text key will be removed.{" "}
                <Button variant="link" tone="accent" onClick={() => setRemoveSttKey(false)}>
                  Keep it
                </Button>
              </p>
            ) : (
              <div className="flex items-center gap-2">
                {savedKey(saved.sttKeyEnding)}
                <Button variant="link" tone="accent" onClick={() => (setSttKey(""), setRemoveSttKey(true))}>
                  Remove
                </Button>
              </div>
            ))}
        </>
      )}
      <FormError error={mutation.error} />
      <Button type="submit" variant="primary" disabled={mutation.isPending}>
        {mutation.isPending ? "Checking the key…" : "Save"}
      </Button>
    </form>
  );
}
