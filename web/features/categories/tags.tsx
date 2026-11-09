import { useState } from "react";
import { z } from "zod";
import { Confirm } from "../../components/confirm";
import { FormError } from "../../components/form";
import { sectionHead } from "../../components/styles";
import { useApi, useSend } from "../../lib/api";
import { tag as tagSchema } from "../../lib/schemas";
import { RenameTag } from "./rename-tag";
import { TagChip } from "./tag-chip";

export type Tag = z.infer<typeof tagSchema>;

export function Tags() {
  const tags = useApi(z.array(tagSchema), ["/api/tags"]).data ?? [];
  const [active, setActive] = useState<{ id: number; deleting: boolean }>();
  const { mutate: call, error, reset } = useSend("tags");
  const close = () => setActive(undefined);

  return (
    <section>
      <h2 className={`${sectionHead} mt-0!`}>Tags</h2>
      <FormError error={error} className="mb-3" />
      {tags.length === 0 && <p className="text-sm text-ink3">No tags yet. Add one to an expense with #name.</p>}
      <ul className="flex flex-wrap gap-2 text-sm">
        {tags.map((t) =>
          active?.id !== t.id ? (
            <TagChip key={t.id} tag={t} onRename={() => (reset(), setActive({ id: t.id, deleting: false }))} onDelete={() => setActive({ id: t.id, deleting: true })} />
          ) : active.deleting ? (
            <li key={t.id}>
              <Confirm ask={`Remove #${t.name} from every expense?`} yes="Delete" onYes={() => (close(), call(["DELETE", `/api/tags/${t.id}`]))} onNo={close} />
            </li>
          ) : (
            <li key={t.id}>
              <RenameTag tag={t} onSave={(name) => call(["PUT", `/api/tags/${t.id}`, { name }], { onSuccess: close })} onCancel={close} />
            </li>
          ),
        )}
      </ul>
    </section>
  );
}
