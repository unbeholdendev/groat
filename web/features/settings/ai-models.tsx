import type { ReactNode } from "react";
import { paths } from "../../components/icon";
import { FormError } from "../../components/form";
import { panel, subHead } from "../../components/styles";
import { useApi, useSendNow } from "../../lib/api";
import { type Models, models } from "../../lib/schemas";
import { SelectRow } from "./select-row";

const rows: { key: keyof Models; label: string; icon: ReactNode }[] = [
  { key: "chat", label: "Chat", icon: <path d={paths.chat} /> },
  { key: "vision", label: "Receipt photos", icon: <><path d="M3 8.5h4l2-3h6l2 3h4V19H3z" /><circle cx="12" cy="13" r="3.5" /></> },
  { key: "stt", label: "Dictation", icon: <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3ZM5 11a7 7 0 0 0 14 0M12 18v3" /> },
];

export function AiModels({ dictationOnly }: { dictationOnly: boolean }) {
  const query = useApi(models, ["/api/models"], { throwOnError: false });
  const mutation = useSendNow("models");
  const { data } = query;
  if (!query.isError && !data) return null;
  return (
    <div className="flex flex-col">
      <h3 className={`${subHead} mb-3`}>Models</h3>
      <FormError error={query.error} className="px-1" />
      {query.isError && <button type="button" className="press text-accent" onClick={() => void query.refetch()}>Try again</button>}
      {data && (
        <>
          <fieldset disabled={mutation.isPending} className={`${panel} min-w-0`}>
            {rows.filter((r) => !dictationOnly || r.key === "stt").map(({ key, label, icon }) => (
              <SelectRow key={key} label={label} icon={icon} value={data[key].model ?? ""} shown={data[key].model ?? <span className="text-accent">Choose</span>} onChange={(model) => mutation.mutate(["PUT", "/api/models", { [key]: model }])}>
                {!data[key].model && <option value="" disabled>Choose a model</option>}
                {data[key].models.map((m) => <option key={m}>{m}</option>)}
              </SelectRow>
            ))}
          </fieldset>
          {!dictationOnly && data.chat.error && <FormError error={{ message: `Couldn’t list chat models: ${data.chat.error}` }} className="mt-2 px-1" />}
          {data.stt.error && <FormError error={{ message: `Couldn’t list dictation models: ${data.stt.error}` }} className="mt-2 px-1" />}
          <p className="mt-2 px-1 text-[13px] text-ink2">
            {!dictationOnly && !data.chat.model ? "Choose a chat model to turn on asking, AI reading and receipt photos." : !data.stt.model ? "Choose a dictation model to turn on dictation." : dictationOnly ? "Models come from the API key above." : "Models come from the API key above. Receipt photos use the chat model unless you pick another."}
          </p>
        </>
      )}
      <FormError error={mutation.error} className="mt-2 px-1" />
    </div>
  );
}
