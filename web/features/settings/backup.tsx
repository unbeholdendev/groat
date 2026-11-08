import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Button } from "../../components/button";
import { FormError } from "../../components/form";
import { divide, panel, sectionHead } from "../../components/styles";
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

const row = `press relative flex min-h-[62px] w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface2 ${divide}`;

const Row = ({ d, children, hint }: { d: string; children: string; hint: string }) => (
  <>
    <SettingsIcon>
      <path d={d} />
    </SettingsIcon>
    <span className="flex-1">
      <span className="block font-medium">{children}</span>
      <span className="block text-xs text-ink2">{hint}</span>
    </span>
  </>
);

export function Backup({ admin }: { admin: boolean }) {
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
      <h2 className={sectionHead}>Backup and export</h2>
      {admin && <input
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
      />}
      <div className={panel}>
        {admin && (
          <a href="/api/backup" download className={row}>
            <Row d="M12 4v11m-4-4 4 4 4-4M5 19h14" hint="The whole server, except sign-ins, API tokens and chats. Restore it on a new server’s welcome screen.">
              Download backup
            </Row>
          </a>
        )}
        <a href="/api/export" download="expenses.csv" className={row}>
          <Row d="M12 4v11m-4-4 4 4 4-4M5 19h14" hint="Transactions only, for spreadsheets. Import reads this format.">
            Export all as CSV
          </Row>
        </a>
        {admin && (
          <button type="button" className={row} disabled={check.isPending || run.isPending} onClick={() => picker.current?.click()}>
            <Row d="M12 15V4m-4 4 4-4 4 4M5 19h14" hint="Into an empty ledger only. Needs date, note, amount and currency; type, category, subcategory and tags are optional.">
              {check.isPending ? "Checking file…" : "Import from CSV"}
            </Row>
          </button>
        )}
      </div>
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
