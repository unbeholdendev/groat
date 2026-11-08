import { useState } from "react";
import { Button } from "../../components/button";
import { Field, FormError, Input } from "../../components/form";
import { sectionHead } from "../../components/styles";
import { useApi, useSendNow } from "../../lib/api";
import { type AiProvider as Saved, aiProvider } from "../../lib/schemas";

const savedKey = (ending: string | null) => ending !== null && <p className="text-sm text-ink2">{ending ? `Saved key ends in ${ending}.` : "A key is saved."} Leave blank to keep it.</p>;

export function AiProvider() {
  const query = useApi(aiProvider, ["/api/ai"], { throwOnError: false });
  return (
    <section>
      <h2 className={sectionHead}>AI provider</h2>
      <FormError error={query.error} />
      {query.isError && <button type="button" className="press text-accent" onClick={() => void query.refetch()}>Try again</button>}
      {query.data && <ProviderForm key={JSON.stringify(query.data)} saved={query.data} />}
    </section>
  );
}

function ProviderForm({ saved }: { saved: Saved }) {
  const mutation = useSendNow("ai");
  const [baseUrl, setBaseUrl] = useState(saved.baseUrl ?? "");
  const [key, setKey] = useState("");
  const [sttBaseUrl, setSttBaseUrl] = useState(saved.sttBaseUrl ?? "");
  const [sttKey, setSttKey] = useState("");
  const [removeSttKey, setRemoveSttKey] = useState(false);
  const edit = (set: (value: string) => void) => (e: { target: { value: string } }) => (mutation.reset(), set(e.target.value));
  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => {
      e.preventDefault();
      mutation.mutate(["PUT", "/api/ai", { baseUrl, sttBaseUrl, ...(key && { key }), ...(sttKey ? { sttKey } : removeSttKey && { sttKey: "" }) }], { onSuccess: () => (setKey(""), setSttKey("")) });
    }}>
      <p className="text-sm text-ink2">Any OpenAI-compatible API turns on asking, AI reading, receipt photos and dictation. Leave the base URL empty to turn AI off.</p>
      <Field label="Base URL"><Input type="url" inputMode="url" autoCapitalize="none" placeholder="https://api.openai.com/v1" value={baseUrl} onChange={edit(setBaseUrl)} /></Field>
      <Field label="API key"><Input type="password" autoComplete="off" value={key} onChange={edit(setKey)} /></Field>
      {savedKey(saved.keyEnding)}
      <Field label="Speech-to-text URL (optional)"><Input type="url" inputMode="url" autoCapitalize="none" placeholder="Same as the base URL" value={sttBaseUrl} onChange={edit(setSttBaseUrl)} /></Field>
      <Field label="Speech-to-text key (optional)"><Input type="password" autoComplete="off" placeholder="Same as the API key" value={sttKey} onChange={edit(setSttKey)} disabled={removeSttKey} /></Field>
      {saved.sttKeyEnding !== null && (removeSttKey
        ? <p className="text-sm text-ink2">The speech-to-text key will be removed. <Button variant="link" tone="accent" onClick={() => setRemoveSttKey(false)}>Keep it</Button></p>
        : <div className="flex items-center gap-2">{savedKey(saved.sttKeyEnding)}<Button variant="link" tone="accent" onClick={() => (setSttKey(""), setRemoveSttKey(true))}>Remove</Button></div>)}
      <FormError error={mutation.error} />
      <Button type="submit" variant="primary" disabled={mutation.isPending}>{mutation.isPending ? "Checking provider…" : "Save provider"}</Button>
    </form>
  );
}
