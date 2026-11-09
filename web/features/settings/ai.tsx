import type { ReactNode } from "react";
import { paths } from "../../components/icon";
import { divide, panel, sectionHead } from "../../components/styles";
import { useSettings } from "../../lib/api";
import type { Settings } from "../../lib/schemas";
import { AiModels } from "./ai-models";
import { AiProvider } from "./ai-provider";
import { Chatgpt } from "./chatgpt";
import { SettingsIcon } from "./settings-icon";

const Status = ({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) => (
  <div className={`flex h-[62px] items-center gap-3 px-4 ${divide}`}>
    <SettingsIcon>{icon}</SettingsIcon>
    <span className="flex-1 font-medium">{label}</span>
    <span className="text-ink2">{value}</span>
  </div>
);

const source = (s: Settings) => (s.aiSource === "chatgpt" ? "ChatGPT" : "API key");

function caption(s: Settings, admin: boolean) {
  if (s.aiProblem) return s.aiProblem;
  if (!s.aiSource) return admin ? "Connect a ChatGPT plan or add an API key to turn on asking, receipt photos and dictation." : "AI isn’t set up. Ask an admin to turn it on.";
  if (!s.ai) return admin ? "Choose a chat model below to turn AI on." : "AI isn’t finished setting up. Ask an admin to choose a chat model.";
  const shared = "Everyone on this server uses it, and chats are shared.";
  if (s.voice) return shared;
  return `${shared} Dictation needs ${s.aiSource === "chatgpt" ? "an API key, as ChatGPT doesn’t offer it" : "a speech-to-text model"}.`;
}

export function Ai({ admin }: { admin: boolean }) {
  const settings = useSettings()!;
  return (
    <section>
      <h2 className={sectionHead}>AI</h2>
      <div className={panel}>
        <Status
          icon={<path d={paths.chat} />}
          label="Asking and receipts"
          value={settings.ai ? source(settings) : settings.aiProblem ? <span className="text-up">Needs attention</span> : "Off"}
        />
        <Status icon={<path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3ZM5 11a7 7 0 0 0 14 0M12 18v3" />} label="Dictation" value={settings.voice ? "API key" : "Off"} />
      </div>
      <p className={`mt-2 px-1 text-[13px] ${settings.aiProblem ? "text-up" : "text-ink2"}`}>{caption(settings, admin)}</p>
      {admin && (
        <>
          <Chatgpt keyInUse={settings.aiSource === "key"} />
          <AiProvider dictationOnly={settings.aiSource === "chatgpt"} />
          <AiModels dictationOnly={settings.aiSource === "chatgpt"} />
        </>
      )}
    </section>
  );
}
