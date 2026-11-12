import { expect, test } from "bun:test";
import { setup } from "./harness";

test("editing an expense updates its fields", async () => {
  const { call } = setup();
  const { body } = await call("POST", "/api/transactions", { note: "Cofee", amount: "3.20", date: "2026-10-09" });
  const edited = await call("PUT", `/api/transactions/${body.id}`, {
    note: "Coffee",
    amount: "3.50",
    date: "2026-10-08",
  });
  expect(edited.status).toBe(200);
  expect((await call("GET", "/api/transactions")).body).toMatchObject([
    { id: body.id, note: "Coffee", amount: 350, currency: "GBP", date: "2026-10-08", baseAmount: 350 },
  ]);
});

test("deleting moves an expense from the list to the bin", async () => {
  const { call } = setup();
  const keep = await call("POST", "/api/transactions", { note: "Keep", amount: "1", date: "2026-10-09" });
  const gone = await call("POST", "/api/transactions", { note: "Gone", amount: "2", date: "2026-10-09" });
  expect((await call("DELETE", `/api/transactions/${gone.body.id}`)).status).toBe(200);
  expect((await call("PUT", `/api/transactions/${gone.body.id}`, { note: "x", amount: "1" })).status).toBe(404);
  expect((await call("GET", "/api/transactions")).body.map((e: { id: number }) => e.id)).toEqual([keep.body.id]);
  expect((await call("GET", "/api/bin")).body).toMatchObject([
    { id: gone.body.id, note: "Gone", amount: 200, currency: "GBP", date: "2026-10-09" },
  ]);
});

test("restoring returns an expense from the bin to the list", async () => {
  const { call } = setup();
  const { body } = await call("POST", "/api/transactions", { note: "Oops", amount: "4", date: "2026-10-09" });
  await call("DELETE", `/api/transactions/${body.id}`);
  expect((await call("POST", `/api/bin/${body.id}/restore`)).status).toBe(200);
  expect((await call("GET", "/api/bin")).body).toEqual([]);
  expect((await call("GET", "/api/transactions")).body).toMatchObject([
    { id: body.id, note: "Oops", amount: 400, currency: "GBP", date: "2026-10-09", baseAmount: 400 },
  ]);
});

test("emptying the bin removes binned expenses for good and leaves the list alone", async () => {
  const { call } = setup();
  const keep = await call("POST", "/api/transactions", { note: "Keep", amount: "1" });
  const a = await call("POST", "/api/transactions", { note: "A", amount: "2" });
  const b = await call("POST", "/api/transactions", { note: "B", amount: "3" });
  await call("DELETE", `/api/transactions/${a.body.id}`);
  await call("DELETE", `/api/transactions/${b.body.id}`);
  expect((await call("DELETE", "/api/bin")).status).toBe(200);
  expect((await call("GET", "/api/bin")).body).toEqual([]);
  expect((await call("POST", `/api/bin/${a.body.id}/restore`)).status).toBe(404);
  expect((await call("GET", "/api/transactions")).body.map((e: { id: number }) => e.id)).toEqual([keep.body.id]);
});

test("purging an expense deletes it without a trace in the bin", async () => {
  const { call } = setup();
  const { body } = await call("POST", "/api/transactions", { note: "Typo", amount: "2", tags: ["x"] });
  expect((await call("DELETE", `/api/transactions/${body.id}?purge`)).body).toEqual({ id: body.id });
  expect((await call("GET", "/api/transactions")).body).toEqual([]);
  expect((await call("GET", "/api/bin")).body).toEqual([]);
  expect((await call("DELETE", `/api/transactions/${body.id}?purge`)).status).toBe(404);
});
