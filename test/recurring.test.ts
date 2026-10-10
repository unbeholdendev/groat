import { expect, test } from "bun:test";
import { setup } from "./harness";

const advance = (clock: { now: Date }, days: number) => (clock.now = new Date(clock.now.getTime() + days * 86_400_000));
const dates = async (call: ReturnType<typeof setup>["call"]) =>
  (await call("GET", "/api/expenses")).body.map((e: { date: string }) => e.date).reverse();

test("advancing the clock creates every due occurrence, backfilling missed days", async () => {
  const { call, clock, restart } = setup("2026-10-10T12:00:00Z");
  const r = await call("POST", "/api/recurring", { note: "Paper", amount: "2.50", period: "day", every: 2, startDate: "2026-10-08" });
  expect(r.status).toBe(201);
  expect(await dates(call)).toEqual(["2026-10-08", "2026-10-10"]);
  advance(clock, 5);
  expect(await dates(call)).toEqual(["2026-10-08", "2026-10-10"]);
  restart();
  const list = (await call("GET", "/api/expenses")).body;
  expect(list.map((e: { date: string }) => e.date)).toEqual(["2026-10-14", "2026-10-12", "2026-10-10", "2026-10-08"]);
  expect(list[0]).toMatchObject({ note: "Paper", amount: 250, currency: "GBP", status: "normal", recurringId: r.body.id });
});

test("a monthly recurrence on the 31st falls on the last day of shorter months", async () => {
  const { call } = setup("2028-04-01T12:00:00Z");
  await call("POST", "/api/recurring", { note: "Rent", amount: "900", period: "month", every: 1, startDate: "2028-01-31" });
  expect(await dates(call)).toEqual(["2028-01-31", "2028-02-29", "2028-03-31"]);
});

test("an end date stops generation", async () => {
  const { call, clock, restart } = setup("2026-10-01T12:00:00Z");
  await call("POST", "/api/recurring", { note: "Gym", amount: "10", period: "week", every: 1, startDate: "2026-10-01", endDate: "2026-10-15" });
  advance(clock, 60);
  restart();
  expect(await dates(call)).toEqual(["2026-10-01", "2026-10-08", "2026-10-15"]);
});

test("needs-confirmation creates pending expenses that can be edited and confirmed", async () => {
  const { call } = setup("2026-10-10T12:00:00Z");
  await call("POST", "/api/recurring", { note: "Power", amount: "60", period: "month", every: 1, startDate: "2026-10-01", needsConfirmation: true });
  const [pending] = (await call("GET", "/api/expenses")).body;
  expect(pending).toMatchObject({ amount: 6000, status: "pending" });
  const edited = await call("PUT", `/api/expenses/${pending.id}`, { note: "Power", amount: "72.40", date: "2026-10-01" });
  expect(edited.body).toMatchObject({ amount: 7240, status: "pending" });
  expect((await call("POST", `/api/expenses/${pending.id}/confirm`)).body).toMatchObject({ amount: 7240, status: "normal" });
});

test("pending expenses stay out of stats until confirmed", async () => {
  const { call } = setup("2026-10-10T12:00:00Z");
  await call("POST", "/api/recurring", { note: "Power", amount: "60", period: "month", every: 1, startDate: "2026-10-01", needsConfirmation: true });
  await call("POST", "/api/expenses", { note: "Lunch", amount: "5", date: "2026-10-02" });
  const total = async () => (await call("GET", "/api/stats?from=2026-10-01&to=2026-10-31&group=month")).body.total;
  expect(await total()).toBe(500);
  const [, pending] = (await call("GET", "/api/expenses")).body;
  await call("POST", `/api/expenses/${pending.id}/confirm`);
  expect(await total()).toBe(6500);
});

test("pending expenses stay out of export until confirmed", async () => {
  const { app, call } = setup("2026-10-10T12:00:00Z");
  await call("POST", "/api/recurring", { note: "Power", amount: "60", period: "month", every: 1, startDate: "2026-10-01", needsConfirmation: true });
  const csv = async () => (await app.request("/api/export")).text();
  expect(await csv()).not.toContain("Power");
  const [pending] = (await call("GET", "/api/expenses")).body;
  await call("POST", `/api/expenses/${pending.id}/confirm`);
  expect(await csv()).toContain("Power");
});

test("editing a template changes future occurrences only", async () => {
  const { call, clock, restart } = setup("2026-10-10T12:00:00Z");
  const r = await call("POST", "/api/recurring", { note: "Milk", amount: "1", period: "day", every: 1, startDate: "2026-10-09" });
  const edit = await call("PUT", `/api/recurring/${r.body.id}`, { ...r.body, note: "Oat milk", amount: "2" });
  expect(edit.body).toMatchObject({ note: "Oat milk", amount: 200 });
  advance(clock, 1);
  restart();
  const list = (await call("GET", "/api/expenses")).body.map((e: { note: string; amount: number }) => [e.note, e.amount]);
  expect(list).toEqual([["Oat milk", 200], ["Milk", 100], ["Milk", 100]]);
});

test("pause stops generation and resume skips the paused dates", async () => {
  const { call, clock, restart } = setup("2026-10-10T12:00:00Z");
  const r = await call("POST", "/api/recurring", { note: "Paper", amount: "1", period: "day", every: 1, startDate: "2026-10-10" });
  expect((await call("POST", `/api/recurring/${r.body.id}/pause`)).body).toMatchObject({ paused: true });
  advance(clock, 3);
  restart();
  expect(await dates(call)).toEqual(["2026-10-10"]);
  expect((await call("POST", `/api/recurring/${r.body.id}/resume`)).body).toMatchObject({ paused: false });
  advance(clock, 1);
  restart();
  expect(await dates(call)).toEqual(["2026-10-10", "2026-10-14"]);
});

test("deleting a template stops it and keeps its expenses linked", async () => {
  const { call, clock, restart } = setup("2026-10-10T12:00:00Z");
  const r = await call("POST", "/api/recurring", { note: "Paper", amount: "1", period: "day", every: 1, startDate: "2026-10-10" });
  expect((await call("DELETE", `/api/recurring/${r.body.id}`)).status).toBe(200);
  advance(clock, 2);
  restart();
  expect((await call("GET", "/api/recurring")).body).toEqual([]);
  expect((await call("GET", "/api/expenses")).body).toMatchObject([{ date: "2026-10-10", recurringId: r.body.id }]);
});

test("deleting a category moves its templates too", async () => {
  const { call } = setup("2026-10-10T12:00:00Z");
  const cat = await call("POST", "/api/categories", { name: "Bills", icon: "💡", color: "#000" });
  await call("POST", "/api/recurring", { note: "Power", amount: "1", period: "day", every: 1, startDate: "2026-11-01", categoryId: cat.body.id });
  expect((await call("DELETE", `/api/categories/${cat.body.id}`)).status).toBe(200);
  const [uncategorised] = (await call("GET", "/api/categories")).body;
  expect((await call("GET", "/api/recurring")).body).toMatchObject([{ categoryId: uncategorised.id }]);
});

test("changing the interval counts from the last generated date", async () => {
  const { call, clock, restart } = setup("2026-10-10T12:00:00Z");
  const r = await call("POST", "/api/recurring", { note: "Milk", amount: "1", period: "day", every: 1, startDate: "2026-10-08" });
  await call("PUT", `/api/recurring/${r.body.id}`, { ...r.body, amount: "1", period: "week" });
  advance(clock, 7);
  restart();
  expect(await dates(call)).toEqual(["2026-10-08", "2026-10-09", "2026-10-10", "2026-10-17"]);
});

test("the interval is called period and a BTC amount honours the sats unit", async () => {
  const { call } = setup("2026-10-10T12:00:00Z");
  await call("POST", "/api/onboarding", { baseCurrency: "GBP", currencies: ["GBP", "BTC"] });
  const r = await call("POST", "/api/recurring", {
    note: "Node",
    amount: "1000",
    currency: "BTC",
    unit: "sats",
    period: "month",
    every: 1,
    startDate: "2026-11-01",
  });
  expect(r.body).toMatchObject({ amount: 1000, period: "month" });
  expect(r.body.unit).toBeUndefined();
});
