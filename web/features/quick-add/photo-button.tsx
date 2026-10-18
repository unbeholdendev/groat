import { useRef } from "react";
import { Icon } from "../../components/icon";

export function PhotoButton({ online, onPhoto }: { online: boolean; onPhoto: (file: Blob) => void }) {
  const picker = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={picker}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onPhoto(file);
        }}
      />
      <button
        type="button"
        aria-label="Add from a photo"
        title={online ? "Add from a photo" : "Photos need a connection"}
        disabled={!online}
        onClick={() => picker.current?.click()}
        className="press hit grid size-10 shrink-0 place-items-center rounded-chip text-ink2 disabled:opacity-50"
      >
        <Icon className="size-[18px] stroke-2">
          <path d="M3 8.5h4l2-3h6l2 3h4V19H3z" />
          <circle cx="12" cy="13" r="3.5" />
        </Icon>
      </button>
    </>
  );
}
