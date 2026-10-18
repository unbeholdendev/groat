import { z } from "zod";
import { FormError } from "../../components/form";
import { panel, sectionHead } from "../../components/styles";
import { useApi, useSend } from "../../lib/api";
import { apiToken } from "../../lib/schemas";
import { TokenForm } from "./token-form";
import { TokenRow } from "./token-row";
import { TokenSecret } from "./token-secret";

const secret = z.object({ token: z.string() });

export function Tokens() {
  const tokens = useApi(z.array(apiToken), ["/api/tokens"]).data ?? [];
  const create = useSend("token");
  const revoke = useSend("token");
  const shown = secret.safeParse(create.data).data?.token;

  return (
    <section>
      <h2 className={sectionHead}>API tokens</h2>
      <p className="-mt-1 mb-3 px-1 text-[13px] text-ink2">Let a phone shortcut add expenses by posting text to /api/capture.</p>
      {shown && <TokenSecret key={shown} token={shown} />}
      <ul className={panel}>
        {tokens.map((t) => (
          <TokenRow key={t.id} token={t} onRevoke={() => revoke.mutate(["DELETE", `/api/tokens/${t.id}`])} />
        ))}
        <li>
          <TokenForm create={create} />
        </li>
      </ul>
      <FormError error={create.error ?? revoke.error} className="mt-2 px-1" />
    </section>
  );
}
