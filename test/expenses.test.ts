import { expect, test } from "bun:test";
import { setup } from "./harness";

test("a created expense shows in the list", async () => {
  const { call } = setup();
  const created = await call("POST", "/api/expenses", { note: "Coffee", amount: "3.20", date: "2026-10-09" });
  expect(created.status).toBe(201);
  const list = await call("GET", "/api/expenses");
  expect(list.body).toMatchObject([
    { id: created.body.id, note: "Coffee", amount: 320, currency: "GBP", date: "2026-10-09", baseAmount: 320 },
  ]);
});

test("list is newest first and date defaults to today", async () => {
  const { call, clock } = setup("2026-10-10T23:30:00Z");
  await call("POST", "/api/expenses", { note: "Old", amount: "1", date: "2026-01-01" });
  await call("POST", "/api/expenses", { note: "Today", amount: "2" });
  clock.now = new Date("2026-10-11T08:00:00Z");
  await call("POST", "/api/expenses", { note: "Later today", amount: "3", date: "2026-10-10" });
  const list = await call("GET", "/api/expenses");
  expect(list.body.map((e: { note: string; date: string }) => [e.note, e.date])).toEqual([
    ["Later today", "2026-10-10"],
    ["Today", "2026-10-10"],
    ["Old", "2026-01-01"],
  ]);
});

test("amounts are stored as integer pence", async () => {
  const { call } = setup();
  await call("POST", "/api/expenses", { note: "a", amount: "0.10" });
  await call("POST", "/api/expenses", { note: "b", amount: "12.5" });
  await call("POST", "/api/expenses", { note: "c", amount: "1234567.89" });
  const list = await call("GET", "/api/expenses");
  expect(list.body.map((e: { amount: number }) => e.amount)).toEqual([123456789, 1250, 10]);
});

test("rejects invalid amounts and missing notes", async () => {
  const { call } = setup();
  for (const amount of ["", "abc", "1.234", "-5", "0", "1e3", "1,50", 5, null])
    expect((await call("POST", "/api/expenses", { note: "x", amount })).status).toBe(400);
  for (const note of [undefined, "", "   ", 7])
    expect((await call("POST", "/api/expenses", { note, amount: "5" })).status).toBe(400);
  for (const date of ["yesterday", "2026-02-31", "2026-13-01", "2026-10-12"])
    expect((await call("POST", "/api/expenses", { note: "x", amount: "5", date })).status).toBe(400);
  expect((await call("POST", "/api/expenses", { note: "ahead of UTC", amount: "5", date: "2026-10-11" })).status).toBe(201);
  for (const currency of ["", "nope", 7])
    expect((await call("POST", "/api/expenses", { note: "x", amount: "5", currency })).status).toBe(400);
  expect((await call("GET", "/api/expenses")).body).toEqual([]);
});

test("unknown API routes are a JSON 404", async () => {
  const { call } = setup();
  expect(await call("GET", "/api/nope")).toEqual({ status: 404, body: { error: "not found" } });
});
