import { useState } from "react";
import { Button } from "../../components/button";
import { Field, FormError, Input } from "../../components/form";
import { sectionHead } from "../../components/styles";
import { useSendNow } from "../../lib/api";

export function PasswordForm() {
  const mutation = useSendNow();
  const [currentPassword, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  return (
    <section>
      <h2 className={sectionHead}>Password</h2>
      <form className="flex flex-col gap-4" onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate(["PUT", "/api/password", { currentPassword, password }], { onSuccess: () => { setCurrent(""); setPassword(""); } });
      }}>
        <Field label="Current password"><Input type="password" autoComplete="current-password" required value={currentPassword} onChange={(e) => { mutation.reset(); setCurrent(e.target.value); }} /></Field>
        <Field label="New password"><Input type="password" autoComplete="new-password" required value={password} onChange={(e) => { mutation.reset(); setPassword(e.target.value); }} /></Field>
        <p className="text-sm text-ink2">Other sessions will be signed out.</p>
        <FormError error={mutation.error} />
        {mutation.isSuccess && <p role="status">Password changed.</p>}
        <Button type="submit" variant="primary" disabled={mutation.isPending}>{mutation.isPending ? "Changing password…" : "Change password"}</Button>
      </form>
    </section>
  );
}
