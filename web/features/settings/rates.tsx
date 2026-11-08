import { Field, Input } from "../../components/form";
import { Button } from "../../components/button";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useApi, useSendNow } from "../../lib/api";
import { sectionHead, panel } from "../../components/styles";

const rates = z.array(z.object({ date: z.string(), currency: z.string(), rate: z.number(), source: z.string() }));

export function Rates() {
  const client = useQueryClient();
  const manual = (useApi(rates, ["/api/rates"]).data ?? []).filter(r => r.source === "manual");
  const mutation = useSendNow();
  const [date, setDate] = useState("");
  const [currency, setCurrency] = useState("");
  const [rate, setRate] = useState("");
  const change = (method: string, path: string, body?: unknown) => mutation.mutate([method, path, body], { onSuccess: () => { void client.invalidateQueries(); } });
  return <section>
    <h2 className={sectionHead}>Exchange rates</h2>
    <p className="-mt-1 mb-3 px-1 text-[13px] text-ink2">Rates are shared by all transactions on the same date. Enter how much 1 USD buys in the other currency. Manual rates stay in use until reset, including when you change base currency.</p>
    <form className={`${panel} grid grid-cols-2 gap-3 p-4`} onSubmit={e => { e.preventDefault(); change("PUT", "/api/rates", { date, currency, rate: Number(rate) }); }}>
      <Field label="Date" className="col-span-2 min-w-0"><Input className="w-full min-w-0" type="date" required value={date} onChange={e => setDate(e.target.value)} /></Field>
      <Field label="Currency" className="min-w-0"><Input className="w-full min-w-0" placeholder="EUR" required value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} /></Field>
      <Field label="Units per 1 USD" className="min-w-0"><Input className="w-full min-w-0" type="number" step="any" min="0" required value={rate} onChange={e => setRate(e.target.value)} /></Field>
      <Button type="submit" variant="primary" className="col-span-2 justify-self-start" disabled={mutation.isPending}>Save manual rate</Button>
      {mutation.error && <p role="alert" className="w-full text-amber">{mutation.error.message}</p>}
      {mutation.isSuccess && <p role="status" className="w-full text-ink2">Rate updated.</p>}
    </form>
    {manual.length > 0 && <ul className={`${panel} mt-3`}>
      {manual.map(r => <li key={`${r.date}-${r.currency}`} className="flex min-h-[62px] items-center gap-1 border-line py-2 pr-2 pl-4 text-[13px] not-last:border-b">
        <span className="flex-1"><span className="block font-medium">1 USD = {r.rate} {r.currency}</span><span className="block text-xs text-ink3">{r.date}</span></span>
        <button type="button" className="min-h-11 px-2 text-accent" onClick={() => { setDate(r.date); setCurrency(r.currency); setRate(String(r.rate)); }}>Edit</button>
        <button type="button" className="min-h-11 px-2 text-accent" disabled={mutation.isPending} onClick={() => change("DELETE", `/api/rates?date=${r.date}&currency=${r.currency}`)}>Reset to automatic</button>
      </li>)}
    </ul>}
    <p className="mt-2 px-1 text-[13px] text-ink2">Reset removes the manual rate and retries automatic lookup. Original amounts stay unchanged. For an actual bank charge, enter the expense in base currency.</p>
  </section>;
}
