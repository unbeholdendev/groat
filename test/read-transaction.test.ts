import { expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { readTransaction, type Intent } from "../server/read-transaction";
import { setup } from "./harness";

async function ledger() {
  const s = setup("2026-10-10T12:00:00Z");
  await s.call("POST", "/api/onboarding", { baseCurrency: "GBP" });
  await s.call("POST", "/api/transactions", { note: "Cafe", amount: "8", currency: "EUR", date: "2026-10-02" });
  const all: { id: number; name: string }[] = (await s.call("GET", "/api/categories")).body;
  const id = (name: string) => all.find((c) => c.name === name)!.id;
  const ctx = { db: drizzle(s.db, { casing: "snake_case" }), clock: () => s.clock.now };
  return { id, read: (raw: object, intent: Intent) => readTransaction(ctx, { note: "Lunch", amount: "12", ...raw }, intent) };
}

type Case = [string, object, Record<string, unknown> | ((id: (name: string) => number) => Record<string, unknown>)];

const defaults = (currency: string, category = "Uncategorised"): Case[2] => (id) => ({ amount: 1200, currency, date: "2026-10-10", categoryId: id(category) });

const cases: [string, (id: (name: string) => number) => Intent, Case[]][] = [
  [
    "add",
    () => ({ intent: "add" }),
    [
      ["defaults to the last-used currency, today and uncategorised", {}, defaults("EUR")],
      ["takes any category kind", { categoryId: "Salary" }, (id) => ({ categoryId: id("Salary") })],
      ["rejects a zero amount", { amount: "0" }, { error: "Invalid amount" }],
      ["accepts tomorrow for local time", { date: "2026-10-11" }, { date: "2026-10-11" }],
      ["rejects later dates", { date: "2026-10-12" }, { error: "Date can’t be in the future" }],
      ["rejects an unknown currency", { currency: "XYZ" }, { error: "Invalid currency" }],
      ["rejects a missing category", { categoryId: 999 }, { error: "Invalid category" }],
    ],
  ],
  [
    "edit",
    (id) => ({ intent: "edit", old: { currency: "USD", categoryId: id("Eating out") } }),
    [
      ["defaults to the old currency and category", {}, defaults("USD", "Eating out")],
      ["rejects a zero amount", { amount: "0" }, { error: "Invalid amount" }],
    ],
  ],
  [
    "edit without a category",
    () => ({ intent: "edit", old: { currency: "USD", categoryId: null } }),
    [["defaults to uncategorised", {}, defaults("USD")]],
  ],
  [
    "chat",
    () => ({ intent: "chat" }),
    [
      ["defaults to the last-used currency", {}, defaults("EUR")],
      ["rejects income categories", { categoryId: "Salary" }, { error: "Drafts are expenses only; pick an expense category" }],
      ["rejects a missing category", { categoryId: 999 }, { error: "Invalid category" }],
      ["rejects a zero amount", { amount: "0" }, { error: "Invalid amount" }],
    ],
  ],
  [
    "extract",
    () => ({ intent: "extract" }),
    [
      ["defaults to the last-used currency", {}, defaults("EUR")],
      ["drops income categories", { categoryId: "Salary" }, defaults("EUR")],
      ["drops missing categories", { categoryId: 999 }, defaults("EUR")],
      ["keeps expense categories", { categoryId: "Eating out" }, defaults("EUR", "Eating out")],
      ["is pending, so a zero amount is a placeholder", { amount: "0" }, { amount: 0 }],
    ],
  ],
  [
    "pending capture",
    () => ({ intent: "capture", pending: true }),
    [
      ["defaults to the last-used currency", {}, defaults("EUR")],
      ["takes any category kind", { categoryId: "Salary" }, (id) => ({ categoryId: id("Salary") })],
      ["allows a zero amount", { amount: "0" }, { amount: 0 }],
    ],
  ],
  [
    "sure capture",
    () => ({ intent: "capture", pending: false }),
    [["rejects a zero amount", { amount: "0" }, { error: "Invalid amount" }]],
  ],
  [
    "income import",
    () => ({ intent: "import", kind: "income" }),
    [
      ["defaults to the base currency and the built-in income category", {}, defaults("GBP", "Other income")],
      ["rejects a zero amount", { amount: "0" }, { error: "Invalid amount" }],
    ],
  ],
  [
    "expense import",
    () => ({ intent: "import", kind: "expense" }),
    [["defaults to the base currency and uncategorised", {}, defaults("GBP")]],
  ],
];

for (const [name, intent, rows] of cases)
  test.each(rows)(`${name}: %s`, async (_, raw, expected) => {
    const { id, read } = await ledger();
    const named = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, k === "categoryId" && typeof v === "string" ? id(v) : v]));
    expect(read(named, intent(id))).toMatchObject(typeof expected === "function" ? expected(id) : expected);
  });
