import { expect, test } from "bun:test";
import { setup } from "./harness";

const tagsOf = async (call: ReturnType<typeof setup>["call"]) =>
  (await call("GET", "/api/transactions")).body.map((e: { note: string; tags: string[] }) => [e.note, e.tags]);

test("renaming a tag renames it on every expense", async () => {
  const { call } = setup();
  await call("POST", "/api/transactions", { note: "a", amount: "1", tags: ["hols", "work"] });
  await call("POST", "/api/transactions", { note: "b", amount: "1", tags: ["hols"] });
  const tags = (await call("GET", "/api/tags")).body;
  expect(tags.map((t: { name: string }) => t.name)).toEqual(["hols", "work"]);
  const hols = tags[0].id;
  expect((await call("PUT", `/api/tags/${hols}`, { name: "holiday-2026" })).body).toEqual({
    id: hols,
    name: "holiday-2026",
  });
  expect(await tagsOf(call)).toEqual([
    ["b", ["holiday-2026"]],
    ["a", ["holiday-2026", "work"]],
  ]);
  expect((await call("PUT", `/api/tags/${hols}`, { name: "work" })).status).toBe(409);
  expect((await call("PUT", `/api/tags/${hols}`, { name: " " })).status).toBe(400);
  expect((await call("PUT", "/api/tags/9999", { name: "x" })).status).toBe(404);
});

test("deleting a tag removes it from expenses", async () => {
  const { call } = setup();
  await call("POST", "/api/transactions", { note: "a", amount: "1", tags: ["hols", "work"] });
  const [hols] = (await call("GET", "/api/tags")).body;
  expect((await call("DELETE", `/api/tags/${hols.id}`)).status).toBe(200);
  expect(await tagsOf(call)).toEqual([["a", ["work"]]]);
  expect((await call("GET", "/api/tags")).body.map((t: { name: string }) => t.name)).toEqual(["work"]);
  expect((await call("DELETE", `/api/tags/${hols.id}`)).status).toBe(404);
});

test("emptying the bin keeps tags working on other expenses", async () => {
  const { call } = setup();
  const gone = await call("POST", "/api/transactions", { note: "gone", amount: "1", tags: ["work"] });
  await call("DELETE", `/api/transactions/${gone.body.id}`);
  await call("DELETE", "/api/bin");
  await call("POST", "/api/transactions", { note: "new", amount: "1", tags: ["work"] });
  expect(await tagsOf(call)).toEqual([["new", ["work"]]]);
});

test("renaming or deleting a tag updates recurring templates", async () => {
  const { call } = setup();
  await call("POST", "/api/transactions", { note: "a", amount: "1", tags: ["hols", "work"] });
  await call("POST", "/api/recurring", {
    note: "r",
    amount: "1",
    period: "month",
    every: 1,
    startDate: "2026-11-01",
    tags: ["hols", "work"],
  });
  const [hols, work] = (await call("GET", "/api/tags")).body;
  await call("PUT", `/api/tags/${hols.id}`, { name: "holiday" });
  expect((await call("GET", "/api/recurring")).body[0].tags).toEqual(["holiday", "work"]);
  await call("DELETE", `/api/tags/${work.id}`);
  expect((await call("GET", "/api/recurring")).body[0].tags).toEqual(["holiday"]);
});
