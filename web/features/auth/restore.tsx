import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "../../components/button";
import { FormError } from "../../components/form";
import { send } from "../../lib/api";

export function Restore() {
  const picker = useRef<HTMLInputElement>(null);
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("backup", file);
      return send("POST", "/api/restore", form);
    },
    networkMode: "always",
    onSuccess: () => client.invalidateQueries({ queryKey: ["/api/session"] }),
  });

  return (
    <div className="flex flex-col items-center gap-1 text-sm text-ink2">
      <input
        ref={picker}
        type="file"
        accept=".sqlite,.db,application/vnd.sqlite3"
        aria-label="Backup file"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) mutation.mutate(file);
        }}
      />
      <p>Moving from another server?</p>
      <Button tone="accent" disabled={mutation.isPending} onClick={() => picker.current?.click()}>
        {mutation.isPending ? "Restoring…" : "Restore from a backup"}
      </Button>
      <FormError error={mutation.error} />
    </div>
  );
}
