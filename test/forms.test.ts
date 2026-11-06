import { expect, test } from "bun:test";
import { credentials } from "../web/features/auth/schema";
import { categoryForm, tagForm } from "../web/features/categories/schema";
import { blank, transactionForm, filled, fromTemplate } from "../web/features/transactions/schema";
import { fields, review } from "../web/features/quick-add/schema";
import { newPassword, tokenName } from "../web/features/settings/schema";
import { today } from "../web/lib/dates";
import type { z } from "zod";

const errors = (r: z.ZodSafeParseResult<unknown>) => (r.success ? [] : r.error.issues.map((i) => i.path.join(".")));

const values = { ...blank("GBP"), note: "Coffee", amount: "3.50", date: "2026-05-01" };

test("expense form parses tags and checks note and amount", () => {
  const r = transactionForm("BTC").safeParse({ ...values, tags: " work, ,trip " });
  expect(r.success && r.data.tags).toEqual(["work", "trip"]);
  expect(errors(transactionForm("BTC").safeParse({ ...values, note: " ", amount: "3.505" }))).toEqual(["note", "amount"]);
  expect(errors(transactionForm("BTC").safeParse({ ...values, amount: "0" }))).toEqual(["amount"]);
  expect(errors(transactionForm("sats").safeParse({ ...values, currency: "BTC", amount: "1.5" }))).toEqual(["amount"]);
  expect(errors(transactionForm("sats").safeParse({ ...values, currency: "BTC", amount: "5000" }))).toEqual([]);
});

test("repeat rules apply only with a period", () => {
  const form = transactionForm("BTC");
  expect(errors(form.safeParse({ ...values, every: "0", endDate: "2020-01-01" }))).toEqual([]);
  const repeat = { ...values, period: "month" };
  expect(errors(form.safeParse({ ...repeat, every: "2", endDate: "2026-05-01" }))).toEqual([]);
  for (const every of ["0", "1.5", "", "x"]) expect(errors(form.safeParse({ ...repeat, every }))).toEqual(["every"]);
  expect(errors(form.safeParse({ ...repeat, endDate: "2026-04-30" }))).toEqual(["endDate"]);
});

test("blank, filled and fromTemplate seed the form", () => {
  expect(blank("EUR")).toMatchObject({ note: "", amount: "", currency: "EUR", date: today(), period: "", every: "1" });
  const draft = { note: "Tea", amount: 250, currency: "GBP", date: "2026-05-01", categoryId: 0, tags: ["a", "b"] };
  expect(filled(draft, "BTC")).toMatchObject({ amount: "2.50", categoryId: null, tags: "a, b", period: "" });
  expect(filled({ ...draft, amount: 0 }, "BTC").amount).toBe("");
  expect(filled({ ...draft, amount: 5000, currency: "BTC" }, "sats").amount).toBe("5000");
  const template = { ...draft, id: 1, categoryId: 3, period: "week", every: 2, startDate: "2026-01-05", endDate: null, needsConfirmation: true, paused: false };
  expect(fromTemplate(template, "BTC")).toMatchObject({ date: "2026-01-05", categoryId: 3, period: "week", every: "2", endDate: "", needsConfirmation: true });
  expect(fromTemplate({ ...template, endDate: "2026-12-31" }, "BTC").endDate).toBe("2026-12-31");
});

test("quick-add review round-trips a draft", () => {
  const draft = { note: "Lunch", amount: 1200, currency: "GBP", date: "2026-05-01", categoryId: null, tags: ["work", "team"] };
  const f = fields(draft, "BTC");
  expect(f).toMatchObject({ amount: "12.00", categoryId: 0, tags: "#work #team" });
  expect(review("sats").parse(f)).toEqual({ ...f, categoryId: undefined, unit: "sats", tags: ["work", "team"] });
  expect(fields({ ...draft, amount: 0 }, "BTC").amount).toBe("");
  expect(errors(review("BTC").safeParse({ ...f, note: "  ", amount: "x" }))).toEqual(["note", "amount"]);
});

test("category, tag, auth and settings forms", () => {
  expect(categoryForm.parse({ name: " Food ", icon: "🍔", color: "#AA00ff", parentId: "4" })).toEqual({ name: "Food", icon: "🍔", color: "#AA00ff", parentId: 4 });
  expect(categoryForm.parse({ name: "Food", icon: "🍔", color: "#aa00ff", parentId: "" }).parentId).toBeNull();
  expect(errors(categoryForm.safeParse({ name: " ", icon: " ", color: "red", parentId: "" }))).toEqual(["name", "icon", "color"]);
  expect(errors(tagForm.safeParse({ name: " " }))).toEqual(["name"]);
  expect(errors(tokenName.safeParse({ name: " " }))).toEqual(["name"]);
  expect(errors(newPassword.safeParse({ password: "" }))).toEqual(["password"]);
  expect(credentials.parse({ username: " ann ", password: " x " })).toEqual({ username: "ann", password: " x " });
  expect(errors(credentials.safeParse({ username: " ", password: "" }))).toEqual(["username", "password"]);
});
