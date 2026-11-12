import { expect, test } from "bun:test";
import { cumulative, valueAt } from "../web/features/stats/cumulative";
import { dayLabel, pick, today } from "../web/lib/dates";
import { money } from "../web/lib/money";
import { change, days, span } from "../web/lib/period";
import { invalidate, stale } from "../web/lib/resources";
import { QueryClient } from "@tanstack/react-query";
import { syncCategory } from "../web/features/categories/queries";
import { syncAi } from "../web/features/settings/queries";

test("changing category kind refreshes derived income settings in the sending tab", async () => {
  const client = new QueryClient();
  client.setQueryData(["/api/settings"], { income: false });
  client.setQueryData(["/api/transactions?", ""], []);
  await syncCategory(client, {}, ["PUT", "/api/categories/3", { kind: "income" }]);
  expect(client.getQueryState(["/api/settings"])?.isInvalidated).toBe(true);
  expect(client.getQueryState(["/api/transactions?", ""])?.isInvalidated).toBe(true);
  client.clear();
});

test("chat changes refresh saved conversations without refreshing the ledger", async () => {
  const client = new QueryClient();
  const keys = [["/api/chats"], ["/api/chats/1"], ["/api/transactions?", ""], ["/api/settings"]];
  for (const key of keys) client.setQueryData(key, {});
  await invalidate(client, ["chats"]);
  expect(keys.map((key) => client.getQueryState(key)?.isInvalidated)).toEqual([true, true, false, false]);
  client.clear();
});

test("money formats fiat and bitcoin", () => {
  expect(money(350, "GBP")).toBe("£3.50");
  expect(money(5000, "JPY")).toBe("JP¥5,000");
  expect(money(123456, "BTC", "sats")).toBe("123,456 sats");
  expect(money(150000000, "BTC")).toBe("1.50000000 BTC");
});

test("dayLabel and pick", () => {
  expect(dayLabel(today())).toBe("Today");
  const y = new Date();
  y.setDate(y.getDate() - 1);
  expect(dayLabel(y.toLocaleDateString("en-CA"))).toBe("Yesterday");
  expect(dayLabel("2001-02-03")).toContain("2001");
  expect(
    pick({ from: "2026-01-01", to: "nope", x: "2026-01-01" }, { from: /^\d{4}-\d{2}-\d{2}$/, to: /^\d+$/ }),
  ).toEqual({ from: "2026-01-01" });
});

test("span compares each preset with the matching earlier stretch", () => {
  const now = new Date(2026, 2, 31);
  expect(span("This month", undefined, now)).toEqual({
    range: ["2026-03-01", "2026-03-31"],
    ref: ["2026-02-01", "2026-02-28"],
    full: ["2026-02-01", "2026-02-28"],
    end: "2026-03-31",
    name: "Feb",
  });
  expect(span("Last month", undefined, now)).toMatchObject({
    range: ["2026-02-01", "2026-02-28"],
    ref: ["2026-01-01", "2026-01-31"],
    name: "Jan",
  });
  expect(span("Year to date", undefined, now)).toMatchObject({
    range: ["2026-01-01", "2026-03-31"],
    ref: ["2025-01-01", "2025-03-31"],
    end: "2026-12-31",
    name: "2025",
  });
  expect(span("Custom", ["2026-03-10", "2026-03-19"], now)).toMatchObject({
    ref: ["2026-02-28", "2026-03-09"],
    end: "2026-03-19",
    name: "Before",
  });
  expect(days("2026-03-28", "2026-04-02")).toBe(6);
});

test("change gives signed percent and tone", () => {
  expect(change(110, 100)).toEqual({ text: "+10%", tone: "text-up" });
  expect(change(90, 100)).toEqual({ text: "−10%", tone: "text-down" });
  expect(change(100, 100)).toEqual({ text: "0%", tone: "text-ink3" });
  expect(change(5, 0)).toBeNull();
});

test("cumulative builds a running total over the range", () => {
  const pts = cumulative(
    [
      { start: "2026-01-01", total: 10 },
      { start: "2026-02-01", total: 5 },
    ],
    ["2026-01-01", "2026-02-28"],
  );
  expect(pts).toEqual([
    [0, 0],
    [30, 10],
    [31, 10],
    [58, 15],
  ]);
  expect(valueAt(pts, 0)).toBe(0);
  expect(valueAt(pts, 30)).toBe(10);
  expect(valueAt(pts, 15)).toBe(5);
  expect(valueAt(pts, 40)).toBe(12);
  expect(valueAt(pts, 58)).toBe(15);
});

test("cumulative ends on the last day of the range", () => {
  const range: [string, string] = ["2026-10-01", "2026-10-19"];
  const last = (b: { start: string; total: number }[]) => cumulative(b, range).at(-1);
  expect(last([{ start: "2026-10-19", total: 4 }])).toEqual([18, 4]);
  expect(
    last([
      { start: "2026-09-28", total: 1 },
      { start: "2026-10-05", total: 2 },
      { start: "2026-10-12", total: 3 },
      { start: "2026-10-19", total: 4 },
    ]),
  ).toEqual([18, 10]);
  expect(last([{ start: "2026-10-01", total: 4 }])).toEqual([18, 4]);
});

test("a resource maps to its queries and their dependents", () => {
  expect(stale(["/api/transactions?", "from=2026-10-01"], ["transactions"])).toBe(true);
  expect(stale(["/api/stats?from=2026-10-01&to=2026-10-31&group=month"], ["transactions"])).toBe(true);
  expect(stale(["/api/stats?from=2026-10-01"], ["categories"])).toBe(true);
  expect(stale(["/api/notes?prefix=", "co"], ["transactions"])).toBe(true);
  expect(stale(["/api/categories"], ["transactions"])).toBe(false);
  expect(
    stale(["/api/chats"], ["transactions", "categories", "settings", "recurring", "members", "tokens", "ai"]),
  ).toBe(false);
  expect(stale(["/api/session"], ["members"])).toBe(false);
  expect(stale(["/api/session"], ["session"])).toBe(true);
  expect(stale(["/api/settings"], ["ai"])).toBe(false);
  expect(stale(["/api/ai/status"], ["ai"])).toBe(true);
  expect(stale(["/api/chatgpt/models"], ["ai"])).toBe(true);
  expect(stale(["transaction-draft", "admin"], ["transactions"])).toBe(false);
});

test("patched queries are left alone", () => {
  expect(stale(["/api/transactions?", "from=2026-10-01"], ["transactions"], ["/api/transactions?"])).toBe(false);
  expect(stale(["/api/bin"], ["transactions"], ["/api/transactions?"])).toBe(true);
});

test("saving an AI provider refreshes capabilities but keeps the patched provider", async () => {
  const client = new QueryClient();
  const provider = { baseUrl: null, keyEnding: null, sttBaseUrl: null, sttKeyEnding: null };
  for (const path of ["/api/ai", "/api/ai/status", "/api/models", "/api/settings"]) client.setQueryData([path], {});
  await syncAi(client, provider);
  expect(client.getQueryData<unknown>(["/api/ai"])).toEqual(provider);
  expect(client.getQueryState(["/api/ai"])?.isInvalidated).toBe(false);
  expect(client.getQueryState(["/api/ai/status"])?.isInvalidated).toBe(true);
  expect(client.getQueryState(["/api/models"])?.isInvalidated).toBe(true);
  expect(client.getQueryState(["/api/settings"])?.isInvalidated).toBe(false);
  client.clear();
});
