import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Button } from "../../components/button";
import { FormError } from "../../components/form";
import { panel, sectionHead, linkRow } from "../../components/styles";
import { send } from "../../lib/api";
import { SettingsIcon } from "./settings-icon";

const preview = z.object({
  count: z.number(),
  totals: z.array(z.object({ currency: z.string(), amount: z.string() })),
  categories: z.array(z.string()),
  rejected: z.array(z.object({ line: z.number(), error: z.string() })),
});
const imported = z.object({ imported: z.number() });
const shown = 20;

const post = (path: string, file: File) => {
  const form = new FormData();
  form.append("file", file);
  return send("POST", path, form);
};

const Row = ({ d, children }: { d: string; children: string }) => (
  <>
    <SettingsIcon>
      <path d={d} />
    </SettingsIcon>
    <span className="flex-1">{children}</span>
  </>
);

export function Backup() {
  const picker = useRef<HTMLInputElement>(null);
  const client = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const check = useMutation({ mutationFn: async (f: File) => preview.parse(await post("/api/import/preview", f)), networkMode: "always" });
  const run = useMutation({
    mutationFn: async (f: File) => imported.parse(await post("/api/import", f)),
    networkMode: "always",
    onSuccess: () => (setFile(null), client.invalidateQueries()),
  });
  const plan = file && check.data;

  return (
    <section>
      <h2 className={sectionHead}>Backup and import</h2>
      <p className="-mt-1 mb-3 px-1 text-[13px] text-ink2">
        One file with every expense, category, schedule, rate, photo and account. Sign-ins, API tokens and chats are left out. Restore it on a new server’s welcome screen.
      </p>
      <input
        ref={picker}
        type="file"
        accept=".csv,text/csv"
        aria-label="CSV file"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          run.reset();
          setFile(f);
          check.mutate(f);
        }}
      />
      <div className={panel}>
        <a href="/api/backup" download className={linkRow}>
          <Row d="M12 4v11m-4-4 4 4 4-4M5 19h14">Download backup</Row>
        </a>
        <button type="button" className={linkRow} disabled={check.isPending || run.isPending} onClick={() => picker.current?.click()}>
          <Row d="M12 15V4m-4 4 4-4 4 4M5 19h14">{check.isPending ? "Checking file…" : "Import from CSV"}</Row>
        </button>
      </div>
      <p className="mt-2 px-1 text-[13px] text-ink2">Import works once, before any expenses are added. Columns: date, note, amount, currency, and optionally category, subcategory and tags.</p>
      <FormError error={check.error ?? run.error} className="mt-2 px-1" />
      {run.data && <p role="status" className="mt-2 px-1 text-sm">Imported {run.data.imported} expenses.</p>}
      {plan && (
        <div className={`${panel} mt-3 flex flex-col gap-2 p-4 text-sm`} aria-label="Import preview">
          <p className="font-medium">
            {plan.count} {plan.count === 1 ? "expense" : "expenses"} in {file.name}
          </p>
          {plan.totals.length > 0 && <p className="num text-ink2">{plan.totals.map((t) => `${t.amount} ${t.currency}`).join(" · ")}</p>}
          {plan.categories.length > 0 && <p className="text-ink2">New categories: {plan.categories.join(", ")}</p>}
          {plan.rejected.length > 0 && (
            <div className="text-up">
              <p>{plan.rejected.length} {plan.rejected.length === 1 ? "row needs" : "rows need"} fixing before you can import:</p>
              <ul className="mt-1">
                {plan.rejected.slice(0, shown).map((r) => (
                  <li key={r.line}>
                    Line {r.line}: {r.error}
                  </li>
                ))}
                {plan.rejected.length > shown && <li>and {plan.rejected.length - shown} more</li>}
              </ul>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button onClick={() => (setFile(null), check.reset())}>Cancel</Button>
            <Button variant="primary" disabled={run.isPending || plan.rejected.length > 0 || plan.count === 0} onClick={() => run.mutate(file)}>
              {run.isPending ? "Importing…" : `Import ${plan.count}`}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
